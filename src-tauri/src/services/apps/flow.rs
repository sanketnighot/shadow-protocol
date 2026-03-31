//! Flow adapter — account status, balance fetching, and sponsored transaction preparation (sidecar).
//! Read-only operations do not forward session key material to the sidecar.

use tauri::AppHandle;

use super::runtime::{invoke_sidecar, RuntimeRequest};
use super::state::get_app_config_json;

/// Cadence account from Flow app settings (`cadenceAddress`, or legacy `accountHint` if 16-hex).
/// Ignores `accountHint` when it is an EVM `0x` address.
pub fn configured_cadence_address() -> Option<String> {
    let raw = get_app_config_json("flow").ok()?;
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let s = v
        .get("cadenceAddress")
        .and_then(|x| x.as_str())
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .or_else(|| {
            v.get("accountHint")
                .and_then(|x| x.as_str())
                .map(str::trim)
                .filter(|t| !t.is_empty())
        })?;
    if crate::services::flow_domain::is_flow_evm_style_address(s) {
        return None;
    }
    let stripped = s.strip_prefix("0x").unwrap_or(s);
    if stripped.len() == 16 && stripped.chars().all(|c| c.is_ascii_hexdigit()) {
        Some(stripped.to_ascii_lowercase())
    } else {
        None
    }
}

fn flow_saved_network() -> String {
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

pub async fn account_status(app: &AppHandle) -> Result<serde_json::Value, String> {
    let network = flow_saved_network();

    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "flow.account_status".to_string(),
            app_id: "flow".to_string(),
            payload: serde_json::json!({
                "network": network,
            }),
        },
    )
    .await
    .map_err(|e| {
        tracing::error!("Flow account_status sidecar error: {}", e);
        e.to_string()
    })?;
    if res.ok {
        let mut data = res.data;
        if let Some(addr) = configured_cadence_address() {
            let display = format!("0x{addr}");
            if let Some(obj) = data.as_object_mut() {
                let fill_address = obj
                    .get("address")
                    .map(|v| v.is_null() || v.as_str().map(|s| s.is_empty()).unwrap_or(false))
                    .unwrap_or(true);
                if fill_address {
                    obj.insert("address".to_string(), serde_json::json!(display));
                }
                obj.insert(
                    "configuredCadenceAddress".to_string(),
                    serde_json::json!(display),
                );
            }
        }
        Ok(data)
    } else {
        let err = res
            .error_message
            .clone()
            .unwrap_or_else(|| "Flow adapter error".to_string());
        tracing::error!("Flow account_status error: {}", err);
        Err(err)
    }
}

/// Fetch Cadence-native Flow balances via the apps runtime (REST access node).
pub async fn fetch_balances(app: &AppHandle, address: &str) -> Result<serde_json::Value, String> {
    let network = flow_saved_network();

    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "flow.fetch_balances".to_string(),
            app_id: "flow".to_string(),
            payload: serde_json::json!({
                "address": address,
                "network": network,
            }),
        },
    )
    .await
    .map_err(|e| {
        tracing::error!("Flow fetch_balances sidecar error: {}", e);
        e.to_string()
    })?;

    if res.ok {
        Ok(res.data)
    } else {
        let err = res
            .error_message
            .clone()
            .unwrap_or_else(|| "Failed to fetch Flow balances".to_string());
        tracing::error!("Flow fetch_balances error: {}", err);
        Err(err)
    }
}

pub async fn prepare_sponsored_transaction(
    app: &AppHandle,
    proposal: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let pk = crate::session::get_unlocked_key()
        .map(|z| z.to_string())
        .unwrap_or_default();

    let network = flow_saved_network();

    let mut payload = proposal.clone();
    if let Some(obj) = payload.as_object_mut() {
        obj.insert("privateKeyHex".to_string(), serde_json::json!(pk.clone()));
        obj.insert("apiKey".to_string(), serde_json::json!(pk));
        obj.insert("network".to_string(), serde_json::json!(network));
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
