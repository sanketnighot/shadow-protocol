//! FlowTransactionScheduler-related sidecar calls + SQLite tracking.

use tauri::AppHandle;

use crate::services::local_db::{self, FlowScheduledTransactionRow};
use crate::session;

use super::flow::configured_cadence_address;
use super::runtime::{invoke_sidecar, RuntimeRequest};
use super::state::get_app_config_json;

fn flow_network_from_config() -> String {
    let Ok(raw) = get_app_config_json("flow") else {
        return "testnet".to_string();
    };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return "testnet".to_string();
    };
    match v.get("network").and_then(|n| n.as_str()) {
        Some("mainnet") => "mainnet".to_string(),
        _ => "testnet".to_string(),
    }
}

fn inject_session_key(mut payload: serde_json::Value) -> serde_json::Value {
    if let Some(pk) = session::get_unlocked_key() {
        if let Some(obj) = payload.as_object_mut() {
            obj.insert(
                "privateKeyHex".to_string(),
                serde_json::json!(pk.to_string()),
            );
        }
    }
    payload
}

pub async fn estimate_schedule_fee(
    app: &AppHandle,
    execution_effort: u64,
    priority_raw: u8,
    data_size_mb: &str,
) -> Result<serde_json::Value, String> {
    let network = flow_network_from_config();
    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "flow.estimate_fee".to_string(),
            app_id: "flow".to_string(),
            payload: serde_json::json!({
                "network": network,
                "executionEffort": execution_effort,
                "priorityRaw": priority_raw,
                "dataSizeMB": data_size_mb,
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
            .unwrap_or_else(|| "Flow fee estimate failed".to_string()))
    }
}

pub async fn submit_schedule_intent(
    app: &AppHandle,
    intent_json: serde_json::Value,
    strategy_id: Option<&str>,
) -> Result<serde_json::Value, String> {
    let addr = configured_cadence_address().ok_or_else(|| {
        "Configure cadenceAddress in Flow app settings (16 hex Cadence account).".to_string()
    })?;
    let network = flow_network_from_config();
    let mut payload = serde_json::json!({
        "network": network,
        "cadenceAddress": addr,
        "intentJson": intent_json.to_string(),
    });
    payload = inject_session_key(payload);
    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "flow.schedule_transaction".to_string(),
            app_id: "flow".to_string(),
            payload,
        },
    )
    .await
    .map_err(|e| e.to_string())?;
    if !res.ok {
        return Err(res
            .error_message
            .unwrap_or_else(|| "Flow schedule submit failed".to_string()));
    }
    let tx_id = res
        .data
        .get("txId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if tx_id.is_empty() {
        return Ok(res.data);
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let row = FlowScheduledTransactionRow {
        id: uuid::Uuid::new_v4().to_string(),
        strategy_id: strategy_id.map(|s| s.to_string()),
        flow_scheduler_numeric_id: None,
        handler_type: "intent_log".to_string(),
        cron_expression: None,
        status: "submitted".to_string(),
        priority: "medium".to_string(),
        fee_paid: String::new(),
        submitted_tx_id: tx_id.clone(),
        scheduled_at: now,
        executed_at: None,
        metadata_json: intent_json.to_string(),
        created_at: now,
    };
    let _ = local_db::insert_flow_scheduled_transaction(&row);
    Ok(res.data)
}

pub async fn submit_cron_intent(
    app: &AppHandle,
    cron_expression: &str,
    strategy_id: Option<&str>,
) -> Result<serde_json::Value, String> {
    let addr = configured_cadence_address().ok_or_else(|| {
        "Configure cadenceAddress in Flow app settings (16 hex Cadence account).".to_string()
    })?;
    let network = flow_network_from_config();
    let mut payload = serde_json::json!({
        "network": network,
        "cadenceAddress": addr,
        "cronExpression": cron_expression,
    });
    payload = inject_session_key(payload);
    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "flow.setup_cron".to_string(),
            app_id: "flow".to_string(),
            payload,
        },
    )
    .await
    .map_err(|e| e.to_string())?;
    if !res.ok {
        return Err(res
            .error_message
            .unwrap_or_else(|| "Flow cron intent failed".to_string()));
    }
    let tx_id = res
        .data
        .get("txId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if !tx_id.is_empty() {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let row = FlowScheduledTransactionRow {
            id: uuid::Uuid::new_v4().to_string(),
            strategy_id: strategy_id.map(|s| s.to_string()),
            flow_scheduler_numeric_id: None,
            handler_type: "cron_intent".to_string(),
            cron_expression: Some(cron_expression.to_string()),
            status: "submitted".to_string(),
            priority: "medium".to_string(),
            fee_paid: String::new(),
            submitted_tx_id: tx_id,
            scheduled_at: now,
            executed_at: None,
            metadata_json: serde_json::json!({ "cron": cron_expression }).to_string(),
            created_at: now,
        };
        let _ = local_db::insert_flow_scheduled_transaction(&row);
    }
    Ok(res.data)
}

pub async fn fetch_tx_status(app: &AppHandle, tx_id: &str) -> Result<serde_json::Value, String> {
    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "flow.get_tx_status".to_string(),
            app_id: "flow".to_string(),
            payload: serde_json::json!({ "txId": tx_id }),
        },
    )
    .await
    .map_err(|e| e.to_string())?;
    if res.ok {
        Ok(res.data)
    } else {
        Err(res
            .error_message
            .unwrap_or_else(|| "Flow tx status failed".to_string()))
    }
}

/// Best-effort sync: mark executed when status indicates seal.
/// Log cancel intent for a previously submitted schedule tx id; updates local row status.
pub async fn cancel_scheduled_by_record_id(
    app: &AppHandle,
    record_id: &str,
) -> Result<serde_json::Value, String> {
    let row = local_db::get_flow_scheduled_transaction(record_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Schedule record not found.".to_string())?;
    if row.submitted_tx_id.is_empty() {
        return Err("Nothing to cancel for this record.".to_string());
    }
    let addr = configured_cadence_address().ok_or_else(|| {
        "Configure cadenceAddress in Flow app settings (16 hex Cadence account).".to_string()
    })?;
    let network = flow_network_from_config();
    let mut payload = serde_json::json!({
        "network": network,
        "cadenceAddress": addr,
        "targetTxId": row.submitted_tx_id,
    });
    payload = inject_session_key(payload);
    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "flow.cancel_scheduled".to_string(),
            app_id: "flow".to_string(),
            payload,
        },
    )
    .await
    .map_err(|e| e.to_string())?;
    if !res.ok {
        return Err(res
            .error_message
            .unwrap_or_else(|| "Flow cancel failed".to_string()));
    }
    let _ = local_db::update_flow_scheduled_status(record_id, "cancel_logged", None);
    Ok(res.data)
}

pub async fn sync_submitted_flow_rows(app: &AppHandle) {
    let Ok(rows) = local_db::list_flow_scheduled_transactions(50) else {
        return;
    };
    for row in rows {
        if row.status != "submitted" || row.submitted_tx_id.is_empty() {
            continue;
        }
        if let Ok(st) = fetch_tx_status(app, &row.submitted_tx_id).await {
            let code = st
                .get("status")
                .and_then(|v| v.as_u64())
                .or_else(|| st.get("statusCode").and_then(|v| v.as_u64()));
            if code == Some(4) {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0);
                let _ = local_db::update_flow_scheduled_status(&row.id, "sealed", Some(now));
            }
        }
    }
}
