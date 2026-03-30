//! Flow adapter — account status, balance fetching, and sponsored transaction preparation (sidecar).

use tauri::AppHandle;

use super::runtime::{invoke_sidecar, RuntimeRequest};

pub async fn account_status(app: &AppHandle) -> Result<serde_json::Value, String> {
    let api_key = crate::session::get_unlocked_key()
        .map(|z| z.to_string())
        .unwrap_or_default();

    tracing::info!("Flow account_status called");

    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "flow.account_status".to_string(),
            app_id: "flow".to_string(),
            payload: serde_json::json!({
                "apiKey": api_key,
            }),
        },
    )
    .await
    .map_err(|e| {
        tracing::error!("Flow account_status sidecar error: {}", e);
        e.to_string()
    })?;
    if res.ok {
        Ok(res.data)
    } else {
        let err = res.error_message.clone().unwrap_or_else(|| "Flow adapter error".to_string());
        tracing::error!("Flow account_status error: {}", err);
        Err(err)
    }
}

/// Fetch Flow account balances using Flow's REST API
pub async fn fetch_balances(app: &AppHandle, address: &str) -> Result<serde_json::Value, String> {
    let api_key = crate::session::get_unlocked_key()
        .map(|z| z.to_string())
        .unwrap_or_default();

    tracing::info!("Flow fetch_balances called for address: {}", address);

    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "flow.fetch_balances".to_string(),
            app_id: "flow".to_string(),
            payload: serde_json::json!({
                "address": address,
                "apiKey": api_key,
            }),
        },
    )
    .await
    .map_err(|e| {
        tracing::error!("Flow fetch_balances sidecar error: {}", e);
        e.to_string()
    })?;

    tracing::info!("Flow fetch_balances response: ok={}, data={:?}", res.ok, res.data);

    if res.ok {
        Ok(res.data)
    } else {
        let err = res.error_message.clone().unwrap_or_else(|| "Failed to fetch Flow balances".to_string());
        tracing::error!("Flow fetch_balances error: {}", err);
        Err(err)
    }
}

pub async fn prepare_sponsored_transaction(
    app: &AppHandle,
    proposal: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let api_key = crate::session::get_unlocked_key()
        .map(|z| z.to_string())
        .unwrap_or_default();

    // clone the proposal so we can inject the api key into it
    let mut payload = proposal.clone();
    if let Some(obj) = payload.as_object_mut() {
        obj.insert("apiKey".to_string(), serde_json::json!(api_key));
    }

    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "flow.prepare_sponsored".to_string(),
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
            .unwrap_or_else(|| "Flow transaction preparation failed".to_string()))
    }
}
