//! Lit Protocol adapter — delegates to sidecar (`Vincent` / PKP shaped contract).

use tauri::AppHandle;

use super::runtime::{invoke_sidecar, RuntimeRequest};

pub async fn wallet_status(
    app: &AppHandle,
    guardrails: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "lit.wallet_status".to_string(),
            app_id: "lit-protocol".to_string(),
            payload: guardrails,
        },
    )
    .await
    .map_err(|e| e.to_string())?;
    if res.ok {
        Ok(res.data)
    } else {
        Err(res
            .error_message
            .unwrap_or_else(|| "Lit adapter error".to_string()))
    }
}

pub async fn connect_wallet(
    app: &AppHandle,
    hints: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "lit.wallet_connect".to_string(),
            app_id: "lit-protocol".to_string(),
            payload: hints,
        },
    )
    .await
    .map_err(|e| e.to_string())?;
    if res.ok {
        Ok(res.data)
    } else {
        Err(res
            .error_message
            .unwrap_or_else(|| "Lit connect failed".to_string()))
    }
}

pub async fn precheck_action(
    app: &AppHandle,
    action: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "lit.precheck".to_string(),
            app_id: "lit-protocol".to_string(),
            payload: action,
        },
    )
    .await
    .map_err(|e| e.to_string())?;
    if res.ok {
        Ok(res.data)
    } else {
        Err(res
            .error_message
            .unwrap_or_else(|| "Lit precheck failed".to_string()))
    }
}
