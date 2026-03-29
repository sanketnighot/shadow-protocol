//! Lit Protocol adapter — delegates to sidecar (Vincent PKP / distributed signing).

use tauri::AppHandle;

use super::runtime::{invoke_sidecar, RuntimeRequest};

/// Retrieve the PKP address from stored app config (if minted).
pub fn stored_pkp_address() -> Option<String> {
    let raw = crate::services::apps::state::get_app_config_json("lit-protocol").ok()?;
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    v.get("pkpEthAddress")
        .and_then(|a| a.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

pub async fn wallet_status(
    app: &AppHandle,
    guardrails: serde_json::Value,
) -> Result<serde_json::Value, String> {
    // Inject stored PKP address into the payload
    let mut payload = guardrails;
    if let Some(addr) = stored_pkp_address() {
        payload["pkpAddress"] = serde_json::json!(addr);
    }
    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "lit.wallet_status".to_string(),
            app_id: "lit-protocol".to_string(),
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
            op: "lit.connectivity_check".to_string(),
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

/// Mint a PKP wallet for the AI agent using the user's active session key.
/// The private key is used only to sign an auth message with Lit — it is
/// NOT stored or transmitted in plaintext beyond the sidecar invocation.
pub async fn mint_pkp(
    app: &AppHandle,
    eth_private_key: &str,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({
        "ethPrivateKey": eth_private_key,
    });
    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "lit.mint_pkp".to_string(),
            app_id: "lit-protocol".to_string(),
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
            .unwrap_or_else(|| "PKP mint failed".to_string()))
    }
}

/// Sign data using the PKP via Lit's distributed MPC network.
#[allow(dead_code)]
pub async fn pkp_sign(
    app: &AppHandle,
    eth_private_key: &str,
    pkp_public_key: &str,
    to_sign: &str,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({
        "ethPrivateKey": eth_private_key,
        "pkpPublicKey": pkp_public_key,
        "toSign": to_sign,
    });
    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "lit.execute".to_string(),
            app_id: "lit-protocol".to_string(),
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
            .unwrap_or_else(|| "PKP signing failed".to_string()))
    }
}
