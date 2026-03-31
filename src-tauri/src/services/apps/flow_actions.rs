//! Flow Actions composition previews via apps-runtime sidecar.

use tauri::AppHandle;

use super::runtime::{invoke_sidecar, RuntimeRequest};

pub async fn preview_composition(
    app: &AppHandle,
    kind: &str,
    parameters: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut payload = serde_json::json!({ "kind": kind });
    if let Some(map) = parameters.as_object() {
        for (k, v) in map {
            if k == "kind" {
                continue;
            }
            payload[k] = v.clone();
        }
    }
    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "flow.actions_preview".to_string(),
            app_id: "flow".to_string(),
            payload,
        },
    )
    .await
    .map_err(|e| e.to_string())?;
    if res.ok {
        Ok(res.data)
    } else {
        Err(res
            .error_message
            .unwrap_or_else(|| "Flow Actions preview failed".to_string()))
    }
}
