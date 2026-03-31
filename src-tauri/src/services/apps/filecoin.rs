//! Filecoin backup adapter — encrypted payload handling in Rust-owned flow; upload via sidecar.

use serde_json::Value;
use tauri::AppHandle;

use super::runtime::{invoke_sidecar, RuntimeRequest};
use crate::commands::get_addresses;
use crate::services::local_db::{self, ActiveStrategy, PortfolioSnapshot, TransactionRow};

/// Apply a decoded snapshot JSON object to local state. Returns true if anything changed.
pub fn apply_snapshot_from_payload(app: &AppHandle, root: &Value) -> Result<bool, String> {
    let mut restored_something = false;

    if let Some(facts_val) = root.get("memoryFacts") {
        if let Ok(facts) =
            serde_json::from_value::<Vec<crate::services::agent_state::AgentMemoryItem>>(
                facts_val.clone(),
            )
        {
            let mut mem = crate::services::agent_state::read_memory(app).unwrap_or_default();
            mem.facts = facts;
            crate::services::agent_state::write_memory(app, &mem).map_err(|e| e.to_string())?;
            restored_something = true;
        }
    }

    if let Some(soul_val) = root.get("soul") {
        if let Ok(soul) =
            serde_json::from_value::<crate::services::agent_state::AgentSoul>(soul_val.clone())
        {
            crate::services::agent_state::write_soul(app, &soul).map_err(|e| e.to_string())?;
            restored_something = true;
        }
    }

    if let Some(obj) = root.get("appConfigs").and_then(|v| v.as_object()) {
        for (app_id, cfg_val) in obj {
            let s = serde_json::to_string(cfg_val).map_err(|e| e.to_string())?;
            crate::services::apps::state::set_app_config_json(app_id, &s)
                .map_err(|e: crate::services::local_db::DbError| e.to_string())?;
            restored_something = true;
        }
    }

    if let Some(arr) = root.get("strategies").and_then(|v| v.as_array()) {
        for item in arr {
            if let Ok(strategy) = serde_json::from_value::<ActiveStrategy>(item.clone()) {
                crate::services::local_db::upsert_strategy(&strategy)
                    .map_err(|e: crate::services::local_db::DbError| e.to_string())?;
                restored_something = true;
            }
        }
    }

    if let Some(arr) = root.get("transactionHistory").and_then(|v| v.as_array()) {
        for item in arr {
            let Some(wallet) = item.get("walletAddress").and_then(|v| v.as_str()) else {
                continue;
            };
            let Some(chain) = item.get("chain").and_then(|v| v.as_str()) else {
                continue;
            };
            let row = TransactionRow {
                id: item
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                tx_hash: item
                    .get("txHash")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                chain: chain.to_string(),
                from_addr: item
                    .get("fromAddr")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                to_addr: item
                    .get("toAddr")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                value: item
                    .get("value")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                block_number: item.get("blockNumber").and_then(|v| v.as_i64()),
                timestamp: item.get("timestamp").and_then(|v| v.as_i64()),
                category: item
                    .get("category")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                metadata: item
                    .get("metadata")
                    .and_then(|v| v.as_str())
                    .map(String::from),
            };
            if row.id.is_empty() || row.tx_hash.is_empty() {
                continue;
            }
            local_db::upsert_transactions(wallet, chain, std::slice::from_ref(&row))
                .map_err(|e: local_db::DbError| e.to_string())?;
            restored_something = true;
        }
    }

    if let Some(arr) = root.get("portfolioSnapshots").and_then(|v| v.as_array()) {
        for item in arr {
            if let Ok(snap) = serde_json::from_value::<PortfolioSnapshot>(item.clone()) {
                local_db::insert_portfolio_snapshot_at(
                    snap.timestamp,
                    &snap.total_usd,
                    &snap.top_assets_json,
                    &snap.wallet_breakdown_json,
                    &snap.chain_breakdown_json,
                    &snap.net_flow_usd,
                    &snap.performance_usd,
                )
                .map_err(|e: local_db::DbError| e.to_string())?;
                restored_something = true;
            }
        }
    }

    Ok(restored_something)
}

/// Restore latest Filecoin backup row into local agent/config/strategy state.
pub async fn restore_latest_snapshot(app: &AppHandle) -> Result<bool, String> {
    if !crate::services::apps::state::is_tool_app_ready("filecoin-storage")
        .map_err(|e| e.to_string())?
    {
        return Ok(false);
    }

    let backups =
        crate::services::apps::state::list_app_backups("filecoin-storage", 1).map_err(|e| e.to_string())?;
    let latest = match backups.first() {
        Some(b) => b,
        None => return Ok(false),
    };

    restore_snapshot_by_cid(app, &latest.cid, "filecoin_auto_restore").await
}

/// Restore a specific backup CID (decrypt payload and apply snapshot fields).
pub async fn restore_snapshot_by_cid(
    app: &AppHandle,
    cid: &str,
    audit_kind: &str,
) -> Result<bool, String> {
    let data: Value = prepare_restore(app, cid).await?;

    let hex = data
        .get("ciphertextHex")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Restore response missing payload".to_string())?;
    let bytes = hex::decode(hex).map_err(|e| e.to_string())?;
    let payload = String::from_utf8(bytes).map_err(|e| e.to_string())?;
    let root: Value = serde_json::from_str(&payload).map_err(|e| e.to_string())?;

    if root.get("scope").is_none() {
        return Err("Invalid snapshot: missing scope".to_string());
    }

    let restored = apply_snapshot_from_payload(app, &root)?;
    if restored {
        crate::services::audit::record(
            audit_kind,
            "filecoin",
            Some(cid),
            &serde_json::json!({ "scope": root.get("scope") }),
        );
    }

    Ok(restored)
}

pub async fn prepare_encrypted_backup(
    app: &AppHandle,
    scope: serde_json::Value,
    ciphertext_hex: String,
    policy: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let api_key = crate::services::settings::get_app_secret("filecoin-storage", "filecoinApiKey")
        .unwrap_or(None)
        .unwrap_or_default();

    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "filecoin.backup_upload".to_string(),
            app_id: "filecoin-storage".to_string(),
            payload: serde_json::json!({
                "scope": scope,
                "ciphertextHex": ciphertext_hex,
                "apiKey": api_key,
                "policy": policy,
            }),
        },
    )
    .await
    .map_err(|e| e.to_string())?;
    if res.ok {
        Ok(res.data)
    } else {
        Err(res
            .error_message
            .unwrap_or_else(|| "Filecoin backup failed".to_string()))
    }
}

fn upload_sidecar_metadata(data: &serde_json::Value) -> String {
    let meta = serde_json::json!({
        "uploadComplete": data.get("uploadComplete"),
        "requestedCopies": data.get("requestedCopies"),
        "committedCopies": data.get("committedCopies"),
        "copiesMeta": data.get("copiesMeta"),
        "storageRatePerMonthUsdfc": data.get("storageRatePerMonthUsdfc"),
        "depositNeededUsdfc": data.get("depositNeededUsdfc"),
        "uploadReady": data.get("uploadReady"),
    });
    meta.to_string()
}

fn backup_status_from_upload(data: &serde_json::Value) -> String {
    match data.get("uploadComplete").and_then(|v| v.as_bool()) {
        Some(false) => "partial".to_string(),
        _ => "complete".to_string(),
    }
}

fn backup_notes_from_upload(data: &serde_json::Value) -> String {
    let rate = data
        .get("storageRatePerMonthUsdfc")
        .and_then(|v| v.as_str())
        .unwrap_or("—");
    let dep = data
        .get("depositNeededUsdfc")
        .and_then(|v| v.as_str())
        .unwrap_or("—");
    format!("snapshot rate={rate} USDFC/mo deposit_needed={dep} USDFC")
}

/// Build payload from `scope`, upload via sidecar, insert `app_backups` row. Returns sidecar `data` JSON.
pub async fn upload_and_record_snapshot(
    app: &AppHandle,
    scope: serde_json::Value,
    policy: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let addrs = get_addresses(app);
    let payload = super::payload::backup_payload_from_scope(app, &scope, &addrs)?;
    let ciphertext_hex = hex::encode(&payload);
    let data = prepare_encrypted_backup(app, scope.clone(), ciphertext_hex, policy).await?;
    let cid = data
        .get("cid")
        .and_then(|v| v.as_str())
        .unwrap_or("pending")
        .to_string();
    let row = crate::services::apps::state::AppBackupRow {
        id: uuid::Uuid::new_v4().to_string(),
        app_id: "filecoin-storage".to_string(),
        cid,
        encryption_version: 2,
        created_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0),
        scope_json: scope.to_string(),
        status: backup_status_from_upload(&data),
        size_bytes: Some(payload.len() as i64),
        notes: Some(backup_notes_from_upload(&data)),
        metadata_json: upload_sidecar_metadata(&data),
    };
    crate::services::apps::state::insert_app_backup(&row).map_err(|e| e.to_string())?;
    Ok(data)
}

/// Merge user `backupScope` from Filecoin app config into `base` scope object.
pub fn merge_filecoin_backup_scope(
    base: serde_json::Value,
    cfg: &serde_json::Value,
) -> serde_json::Value {
    let mut scope = base;
    if let Some(bs) = cfg.get("backupScope").cloned() {
        if let (Some(s), Some(b)) = (scope.as_object_mut(), bs.as_object()) {
            for (k, v) in b {
                s.entry(k.clone()).or_insert(v.clone());
            }
        }
    }
    scope
}

/// Fire-and-forget Filecoin snapshot when the integration is installed and enabled.
pub fn spawn_filecoin_snapshot_upload(app: &AppHandle) {
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = trigger_autonomous_backup(&app_clone).await;
    });
}

pub async fn trigger_autonomous_backup(app: &tauri::AppHandle) -> Result<(), String> {
    if !crate::services::apps::state::is_tool_app_ready("filecoin-storage")
        .map_err(|e| e.to_string())?
    {
        return Err("Filecoin app not active".to_string());
    }

    let cfg_raw = crate::services::apps::state::get_app_config_json("filecoin-storage")
        .map_err(|e| e.to_string())?;
    let cfg: serde_json::Value = serde_json::from_str(&cfg_raw).unwrap_or_default();

    let scope = merge_filecoin_backup_scope(serde_json::json!({ "agentMemory": true }), &cfg);

    let policy = cfg.get("policy").cloned();
    upload_and_record_snapshot(app, scope, policy).await?;
    Ok(())
}

/// Synapse cost quote via sidecar (USDFC rate / deposit).
pub async fn sidecar_quote_upload_costs(
    app: &AppHandle,
    data_size: u64,
) -> Result<serde_json::Value, String> {
    let api_key = crate::services::settings::get_app_secret("filecoin-storage", "filecoinApiKey")
        .unwrap_or(None)
        .unwrap_or_default();

    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "filecoin.cost_quote".to_string(),
            app_id: "filecoin-storage".to_string(),
            payload: serde_json::json!({
                "apiKey": api_key,
                "dataSize": data_size,
                "withCDN": true,
            }),
        },
    )
    .await
    .map_err(|e| e.to_string())?;
    if res.ok {
        Ok(res.data)
    } else {
        Err(res
            .error_message
            .unwrap_or_else(|| "Filecoin cost quote failed".to_string()))
    }
}

/// List on-chain storage datasets for the configured Filecoin key.
pub async fn sidecar_list_datasets(app: &AppHandle) -> Result<serde_json::Value, String> {
    let api_key = crate::services::settings::get_app_secret("filecoin-storage", "filecoinApiKey")
        .unwrap_or(None)
        .unwrap_or_default();

    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "filecoin.datasets_list".to_string(),
            app_id: "filecoin-storage".to_string(),
            payload: serde_json::json!({ "apiKey": api_key }),
        },
    )
    .await
    .map_err(|e| e.to_string())?;
    if res.ok {
        Ok(res.data)
    } else {
        Err(res
            .error_message
            .unwrap_or_else(|| "Filecoin dataset list failed".to_string()))
    }
}

pub async fn prepare_restore(app: &AppHandle, cid: &str) -> Result<serde_json::Value, String> {
    let api_key = crate::services::settings::get_app_secret("filecoin-storage", "filecoinApiKey")
        .unwrap_or(None)
        .unwrap_or_default();

    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "filecoin.restore_fetch".to_string(),
            app_id: "filecoin-storage".to_string(),
            payload: serde_json::json!({
                "cid": cid,
                "apiKey": api_key
            }),
        },
    )
    .await
    .map_err(|e| e.to_string())?;
    if res.ok {
        Ok(res.data)
    } else {
        Err(res
            .error_message
            .unwrap_or_else(|| "Filecoin restore failed".to_string()))
    }
}
