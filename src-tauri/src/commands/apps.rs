//! Tauri commands for bundled Apps / integrations marketplace.

use keyring::Error as KeyringError;
use serde::{Deserialize, Serialize};

use crate::services::apps::{
    flow, flow_scheduler, lit, filecoin, permissions, runtime, state as apps_state,
};
use crate::services::local_db;
use crate::services::audit;
use crate::services::local_db::DbError;

fn require_unlocked_session_for_app_settings() -> Result<(), String> {
    if !crate::session::has_unlocked_session() {
        return Err(
            "Unlock your wallet before changing integration settings or app secrets.".to_string(),
        );
    }
    Ok(())
}

fn validate_app_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 64 {
        return Err("Invalid app id".to_string());
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err("Invalid app id characters".to_string());
    }
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppsMarketplaceResponse {
    pub entries: Vec<apps_state::AppMarketplaceEntry>,
}

#[tauri::command]
pub fn apps_marketplace_list() -> Result<AppsMarketplaceResponse, String> {
    let entries = apps_state::list_marketplace().map_err(|e: DbError| e.to_string())?;
    Ok(AppsMarketplaceResponse { entries })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppsInstallInput {
    pub app_id: String,
    #[serde(default)]
    pub acknowledge_permissions: bool,
}

#[tauri::command]
pub async fn apps_install(
    app: tauri::AppHandle,
    input: AppsInstallInput,
) -> Result<AppsMarketplaceResponse, String> {
    let app_id = input.app_id.trim();
    validate_app_id(app_id)?;
    if !apps_state::catalog_has_id(app_id).map_err(|e: DbError| e.to_string())? {
        return Err("Unknown app".to_string());
    }
    if !input.acknowledge_permissions {
        return Err("Permission acknowledgement required".to_string());
    }

    let catalog = apps_state::list_marketplace()
        .map_err(|e: DbError| e.to_string())?
        .into_iter()
        .find(|e| e.catalog.id == app_id)
        .ok_or_else(|| "Catalog entry missing".to_string())?;
    let version = catalog.catalog.version.clone();

    apps_state::upsert_installed_app(app_id, "installing", &version, false)
        .map_err(|e: DbError| e.to_string())?;

    let ping = runtime::ping(&app).await;
    let health_ok = ping.is_ok() && ping.as_ref().map(|p| p.ok).unwrap_or(false);
    if !health_ok {
        apps_state::upsert_installed_app(app_id, "error", &version, false)
            .map_err(|e: DbError| e.to_string())?;
        apps_state::set_health(
            app_id,
            "error",
            Some("Apps runtime health check failed. Ensure bun is installed and apps-runtime is present."),
        )
        .map_err(|e: DbError| e.to_string())?;
        audit::record(
            "app_install",
            "app",
            Some(app_id),
            &serde_json::json!({ "health": "error" }),
        );
        return apps_marketplace_list();
    }

    permissions::grant_manifest_permissions(app_id)?;
    apps_state::acknowledge_permissions(app_id).map_err(|e: DbError| e.to_string())?;
    apps_state::set_installed_enabled(app_id, true).map_err(|e: DbError| e.to_string())?;
    apps_state::set_health(app_id, "ok", None).map_err(|e: DbError| e.to_string())?;

    audit::record(
        "app_install",
        "app",
        Some(app_id),
        &serde_json::json!({ "health": "ok" }),
    );

    apps_marketplace_list()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppsAppIdInput {
    pub app_id: String,
}

#[tauri::command]
pub fn apps_uninstall(input: AppsAppIdInput) -> Result<AppsMarketplaceResponse, String> {
    let app_id = input.app_id.trim();
    validate_app_id(app_id)?;
    crate::services::settings::remove_app_secrets_for(app_id).map_err(|e: KeyringError| e.to_string())?;
    apps_state::delete_installed_app(app_id).map_err(|e: DbError| e.to_string())?;
    audit::record(
        "app_uninstall",
        "app",
        Some(app_id),
        &serde_json::json!({}),
    );
    apps_marketplace_list()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppsSetEnabledInput {
    pub app_id: String,
    pub enabled: bool,
}

#[tauri::command]
pub fn apps_set_enabled(input: AppsSetEnabledInput) -> Result<AppsMarketplaceResponse, String> {
    let app_id = input.app_id.trim();
    validate_app_id(app_id)?;
    if apps_state::get_installed(app_id)
        .map_err(|e: DbError| e.to_string())?
        .is_none()
    {
        return Err("App is not installed".to_string());
    }
    apps_state::set_installed_enabled(app_id, input.enabled).map_err(|e: DbError| e.to_string())?;
    audit::record(
        "app_set_enabled",
        "app",
        Some(app_id),
        &serde_json::json!({ "enabled": input.enabled }),
    );
    apps_marketplace_list()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppsConfigInput {
    pub app_id: String,
    pub config: serde_json::Value,
}

#[tauri::command]
pub fn apps_set_config(app: tauri::AppHandle, input: AppsConfigInput) -> Result<(), String> {
    require_unlocked_session_for_app_settings()?;
    let app_id = input.app_id.trim();
    validate_app_id(app_id)?;
    if apps_state::get_installed(app_id)
        .map_err(|e: DbError| e.to_string())?
        .is_none()
    {
        return Err("App is not installed".to_string());
    }
    let s = serde_json::to_string(&input.config).map_err(|e| e.to_string())?;
    apps_state::set_app_config_json(app_id, &s).map_err(|e: DbError| e.to_string())?;
    audit::record(
        "app_config_update",
        "app",
        Some(app_id),
        &serde_json::json!({}),
    );
    filecoin::spawn_filecoin_snapshot_upload(&app);
    Ok(())
}

#[tauri::command]
pub fn apps_list_backups() -> Result<Vec<apps_state::AppBackupRow>, String> {
    apps_state::list_app_backups("filecoin-storage", 50).map_err(|e: DbError| e.to_string())
}

#[tauri::command]
pub fn apps_get_config(input: AppsAppIdInput) -> Result<serde_json::Value, String> {
    let app_id = input.app_id.trim();
    validate_app_id(app_id)?;
    let raw = apps_state::get_app_config_json(app_id).map_err(|e: DbError| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn apps_runtime_health(app: tauri::AppHandle) -> Result<runtime::RuntimeResponse, String> {
    runtime::ping(&app)
        .await
        .map_err(|e: runtime::AppsRuntimeError| e.to_string())
}

/// Re-ping the apps sidecar and refresh per-integration health rows (sync/status).
#[tauri::command]
pub async fn apps_refresh_health(app: tauri::AppHandle) -> Result<AppsMarketplaceResponse, String> {
    let ping = runtime::ping(&app)
        .await
        .map_err(|e: runtime::AppsRuntimeError| e.to_string())?;
    let entries = apps_state::list_marketplace().map_err(|e: DbError| e.to_string())?;
    if ping.ok {
        for e in &entries {
            if let Some(inst) = &e.installed {
                apps_state::set_health(&inst.app_id, "ok", None).map_err(|e: DbError| e.to_string())?;
            }
        }
        audit::record(
            "apps_health_refresh",
            "apps",
            None,
            &serde_json::json!({ "ok": true }),
        );
    } else {
        let msg = ping
            .error_message
            .as_deref()
            .unwrap_or("Apps runtime unreachable");
        for e in &entries {
            if let Some(inst) = &e.installed {
                apps_state::set_health(&inst.app_id, "error", Some(msg)).map_err(|e: DbError| e.to_string())?;
            }
        }
        audit::record(
            "apps_health_refresh",
            "apps",
            None,
            &serde_json::json!({ "ok": false }),
        );
    }
    apps_marketplace_list()
}

#[tauri::command]
pub async fn apps_lit_wallet_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cfg: serde_json::Value = serde_json::from_str(
        &apps_state::get_app_config_json("lit-protocol").unwrap_or_else(|_| "{}".to_string()),
    )
    .unwrap_or_else(|_| serde_json::json!({}));
    lit::wallet_status(&app, cfg).await
}

/// Mint a new PKP wallet for the AI agent. Requires an unlocked session.
#[tauri::command]
pub async fn apps_lit_mint_pkp(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    require_unlocked_session_for_app_settings()?;
    if !apps_state::is_tool_app_ready("lit-protocol").map_err(|e: DbError| e.to_string())? {
        return Err("Install and enable the Lit Protocol integration first.".to_string());
    }

    // Get active session key
    let key = crate::session::get_unlocked_key()
        .ok_or_else(|| "No active session key. Unlock your wallet first.".to_string())?;

    let result = lit::mint_pkp(&app, &key).await?;

    // Persist PKP address in app config
    let pkp_address = result
        .get("pkpEthAddress")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let pkp_public_key = result
        .get("pkpPublicKey")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let token_id = result
        .get("tokenId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if !pkp_address.is_empty() {
        // Merge into existing config
        let existing_raw =
            apps_state::get_app_config_json("lit-protocol").unwrap_or_else(|_| "{}".to_string());
        let mut existing: serde_json::Value =
            serde_json::from_str(&existing_raw).unwrap_or_else(|_| serde_json::json!({}));
        existing["pkpEthAddress"] = serde_json::json!(pkp_address);
        existing["pkpPublicKey"] = serde_json::json!(pkp_public_key);
        existing["pkpTokenId"] = serde_json::json!(token_id);

        let s = serde_json::to_string(&existing).map_err(|e| e.to_string())?;
        apps_state::set_app_config_json("lit-protocol", &s)
            .map_err(|e: DbError| e.to_string())?;

        audit::record(
            "lit_pkp_minted",
            "app",
            Some("lit-protocol"),
            &serde_json::json!({ "pkpAddress": pkp_address }),
        );
    }

    Ok(result)
}

/// Return the stored PKP address (if one has been minted).
#[tauri::command]
pub fn apps_lit_pkp_address() -> Result<serde_json::Value, String> {
    let addr = lit::stored_pkp_address();
    Ok(serde_json::json!({
        "pkpAddress": addr,
        "hasPkp": addr.is_some(),
    }))
}

#[tauri::command]
pub async fn apps_flow_account_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    flow::account_status(&app).await
}

#[tauri::command]
pub async fn apps_flow_list_scheduled(
    limit: Option<u32>,
) -> Result<Vec<local_db::FlowScheduledTransactionRow>, String> {
    let lim = limit.unwrap_or(50).clamp(1, 200);
    local_db::list_flow_scheduled_transactions(lim).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn apps_flow_estimate_schedule_fee(
    app: tauri::AppHandle,
    execution_effort: Option<u64>,
    priority_raw: Option<u8>,
    data_size_mb: Option<String>,
) -> Result<serde_json::Value, String> {
    let effort = execution_effort.unwrap_or(100);
    let pr = priority_raw.unwrap_or(1);
    let mb = data_size_mb
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or("0.0001")
        .to_string();
    flow_scheduler::estimate_schedule_fee(&app, effort, pr, &mb).await
}

#[tauri::command]
pub async fn apps_flow_sync_scheduled(app: tauri::AppHandle) -> Result<(), String> {
    flow_scheduler::sync_submitted_flow_rows(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn apps_flow_cancel_scheduled_record(
    app: tauri::AppHandle,
    record_id: String,
) -> Result<serde_json::Value, String> {
    let id = record_id.trim();
    if id.is_empty() {
        return Err("recordId required".to_string());
    }
    flow_scheduler::cancel_scheduled_by_record_id(&app, id).await
}

#[tauri::command]
pub async fn apps_filecoin_auto_restore(app: tauri::AppHandle) -> Result<bool, String> {
    require_unlocked_session_for_app_settings()?;
    filecoin::restore_latest_snapshot(&app).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppsFilecoinRestoreByCidInput {
    pub cid: String,
}

#[tauri::command]
pub async fn apps_filecoin_restore_by_cid(
    app: tauri::AppHandle,
    input: AppsFilecoinRestoreByCidInput,
) -> Result<bool, String> {
    require_unlocked_session_for_app_settings()?;
    let cid = input.cid.trim();
    if cid.is_empty() || cid.len() > 256 {
        return Err("Invalid CID".to_string());
    }
    if !apps_state::is_tool_app_ready("filecoin-storage").map_err(|e| e.to_string())? {
        return Err("Filecoin app not active".to_string());
    }
    filecoin::restore_snapshot_by_cid(&app, cid, "filecoin_restore_by_cid").await
}

#[tauri::command]
pub async fn apps_filecoin_backup_now(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    require_unlocked_session_for_app_settings()?;
    if !apps_state::is_tool_app_ready("filecoin-storage").map_err(|e| e.to_string())? {
        return Err("Filecoin app not active".to_string());
    }
    let cfg_raw =
        apps_state::get_app_config_json("filecoin-storage").map_err(|e: DbError| e.to_string())?;
    let cfg: serde_json::Value = serde_json::from_str(&cfg_raw).unwrap_or_default();
    let scope = filecoin::merge_filecoin_backup_scope(serde_json::json!({}), &cfg);
    let policy = cfg.get("policy").cloned();
    filecoin::upload_and_record_snapshot(&app, scope, policy).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppsFilecoinQuoteInput {
    pub data_size: Option<u64>,
}

#[tauri::command]
pub async fn apps_filecoin_quote_cost(
    app: tauri::AppHandle,
    input: AppsFilecoinQuoteInput,
) -> Result<serde_json::Value, String> {
    require_unlocked_session_for_app_settings()?;
    if !apps_state::is_tool_app_ready("filecoin-storage").map_err(|e| e.to_string())? {
        return Err("Filecoin app not active".to_string());
    }
    let size = input.data_size.unwrap_or(1024).clamp(127, 1_065_353_216);
    filecoin::sidecar_quote_upload_costs(&app, size).await
}

#[tauri::command]
pub async fn apps_filecoin_list_datasets(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    require_unlocked_session_for_app_settings()?;
    if !apps_state::is_tool_app_ready("filecoin-storage").map_err(|e| e.to_string())? {
        return Err("Filecoin app not active".to_string());
    }
    filecoin::sidecar_list_datasets(&app).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppsSecretInput {
    pub app_id: String,
    pub key: String,
    pub value: String,
}

#[tauri::command]
pub fn apps_set_secret(input: AppsSecretInput) -> Result<(), String> {
    require_unlocked_session_for_app_settings()?;
    validate_app_id(&input.app_id)?;
    validate_secret_key(&input.key)?;
    if input.value.len() > 4096 {
        return Err("Secret too long".to_string());
    }
    crate::services::settings::set_app_secret(&input.app_id, &input.key, &input.value)
        .map_err(|e| e.to_string())
}

fn validate_secret_key(key: &str) -> Result<(), String> {
    if key.is_empty() || key.len() > 64 {
        return Err("Invalid secret key".to_string());
    }
    if !key
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
    {
        return Err("Invalid secret key".to_string());
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppsSecretKeyInput {
    pub app_id: String,
    pub key: String,
}

#[tauri::command]
pub fn apps_remove_secret(input: AppsSecretKeyInput) -> Result<(), String> {
    require_unlocked_session_for_app_settings()?;
    validate_app_id(&input.app_id)?;
    validate_secret_key(&input.key)?;
    crate::services::settings::remove_app_secret(&input.app_id, &input.key).map_err(|e| e.to_string())
}
