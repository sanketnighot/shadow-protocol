//! Cross-VM Flow bridge previews via apps-runtime sidecar.

use tauri::AppHandle;

use super::runtime::{invoke_sidecar, RuntimeRequest};

pub async fn preview_bridge(
    app: &AppHandle,
    direction: &str,
    token_ref: &str,
    amount_hint: &str,
) -> Result<serde_json::Value, String> {
    let dir = if direction == "evm_to_cadence" {
        "evm_to_cadence"
    } else {
        "cadence_to_evm"
    };
    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "flow.bridge_preview".to_string(),
            app_id: "flow".to_string(),
            payload: serde_json::json!({
                "direction": dir,
                "tokenRef": token_ref,
                "amountHint": amount_hint,
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
            .unwrap_or_else(|| "Flow bridge preview failed".to_string()))
    }
}
