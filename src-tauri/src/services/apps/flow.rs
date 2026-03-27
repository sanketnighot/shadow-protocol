//! Flow adapter — account status and sponsored transaction preparation (sidecar).

use tauri::AppHandle;

use super::runtime::{invoke_sidecar, RuntimeRequest};

pub async fn account_status(app: &AppHandle) -> Result<serde_json::Value, String> {
    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "flow.account_status".to_string(),
            app_id: "flow".to_string(),
            payload: serde_json::json!({}),
        },
    )
    .await
    .map_err(|e| e.to_string())?;
    if res.ok {
        Ok(res.data)
    } else {
        Err(res
            .error_message
            .unwrap_or_else(|| "Flow adapter error".to_string()))
    }
}

pub async fn prepare_sponsored_transaction(
    app: &AppHandle,
    proposal: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "flow.prepare_sponsored".to_string(),
            app_id: "flow".to_string(),
            payload: proposal,
        },
    )
    .await
    .map_err(|e| e.to_string())?;
    if res.ok {
        Ok(res.data)
    } else {
        Err(res
            .error_message
            .unwrap_or_else(|| "Flow transaction preparation failed".to_string()))
    }
}
