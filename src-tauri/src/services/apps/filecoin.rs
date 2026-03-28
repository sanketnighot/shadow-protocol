//! Filecoin backup adapter — encrypted payload handling in Rust-owned flow; upload via sidecar.

use tauri::AppHandle;

use super::runtime::{invoke_sidecar, RuntimeRequest};

pub async fn prepare_encrypted_backup(
    app: &AppHandle,
    scope: serde_json::Value,
    ciphertext_hex: String,
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

pub async fn prepare_restore(
    app: &AppHandle,
    cid: &str,
) -> Result<serde_json::Value, String> {
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
