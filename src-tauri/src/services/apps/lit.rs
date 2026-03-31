//! Lit Protocol / Vincent adapter — delegates to sidecar.
//!
//! Operations:
//!   - Raw Lit PKP ops: wallet_status, connectivity_check, precheck, mint_pkp, execute
//!   - Vincent SDK ops: configure, consent_url, verify_jwt, wallet_status, execute_ability, precheck_policy

use tauri::AppHandle;

use super::runtime::{invoke_sidecar, RuntimeRequest};
use super::state::{self, VincentConsentRow};
use crate::services::local_db::DbError;

/// Retrieve the PKP address from stored app config (if minted).
pub fn stored_pkp_address() -> Option<String> {
    let raw = state::get_app_config_json("lit-protocol").ok()?;
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    v.get("pkpEthAddress")
        .and_then(|a| a.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

// ---------------------------------------------------------------------------
// Vincent consent helpers
// ---------------------------------------------------------------------------

/// Get the current active Vincent consent (if any) from SQLite.
pub fn get_vincent_consent() -> Option<VincentConsentRow> {
    state::get_active_vincent_consent("lit-protocol").ok().flatten()
}

/// Get the consent URL the user should open in their browser.
pub async fn vincent_consent_url(
    app: &AppHandle,
    redirect_uri: Option<&str>,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({
        "redirectUri": redirect_uri.unwrap_or("shadow://vincent-consent"),
    });
    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "vincent.consent_url".to_string(),
            app_id: "lit-protocol".to_string(),
            payload,
        },
    )
    .await
    .map_err(|e| e.to_string())?;
    if res.ok {
        Ok(res.data)
    } else {
        Err(res.error_message.unwrap_or_else(|| "Failed to get consent URL".to_string()))
    }
}

/// Verify a Vincent consent JWT and persist it to SQLite.
pub async fn vincent_verify_and_store_jwt(
    app: &AppHandle,
    jwt: &str,
) -> Result<VincentConsentRow, String> {
    let payload = serde_json::json!({ "jwt": jwt });
    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "vincent.verify_jwt".to_string(),
            app_id: "lit-protocol".to_string(),
            payload,
        },
    )
    .await
    .map_err(|e| e.to_string())?;

    if !res.ok {
        return Err(res.error_message.unwrap_or_else(|| "JWT verification failed".to_string()));
    }

    let pkp_address = res.data.get("pkpAddress").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let pkp_public_key = res.data.get("pkpPublicKey").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let expires_at = res.data.get("expiresAt").and_then(|v| v.as_i64()).unwrap_or(0);
    let granted_abilities = res.data.get("grantedAbilities")
        .and_then(|v| serde_json::to_string(v).ok())
        .unwrap_or_else(|| "[]".to_string());

    if pkp_address.is_empty() {
        return Err("JWT missing pkpAddress".to_string());
    }

    state::upsert_vincent_consent(
        "lit-protocol",
        &pkp_address,
        &pkp_public_key,
        jwt,
        &granted_abilities,
        expires_at,
    )
    .map_err(|e: DbError| e.to_string())?;

    // Also persist PKP address to the app_configs for backward compat
    let existing_raw = state::get_app_config_json("lit-protocol").unwrap_or_else(|_| "{}".to_string());
    let mut existing: serde_json::Value =
        serde_json::from_str(&existing_raw).unwrap_or_else(|_| serde_json::json!({}));
    existing["pkpEthAddress"] = serde_json::json!(pkp_address);
    if !pkp_public_key.is_empty() {
        existing["pkpPublicKey"] = serde_json::json!(pkp_public_key);
    }
    let s = serde_json::to_string(&existing).map_err(|e| e.to_string())?;
    let _ = state::set_app_config_json("lit-protocol", &s);

    state::get_active_vincent_consent("lit-protocol")
        .map_err(|e: DbError| e.to_string())?
        .ok_or_else(|| "Failed to retrieve stored consent".to_string())
}

/// Revoke Vincent consent (deletes from SQLite).
pub fn vincent_revoke_consent() -> Result<(), String> {
    state::delete_vincent_consent("lit-protocol").map_err(|e: DbError| e.to_string())
}

/// Execute a Vincent ability via the sidecar (post-user-approval).
pub async fn vincent_execute_ability(
    app: &AppHandle,
    operation: &str,
    ability_params: serde_json::Value,
    delegatee_key: &str,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({
        "operation": operation,
        "params": ability_params,
        "delegateeKey": delegatee_key,
    });
    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "vincent.execute_ability".to_string(),
            app_id: "lit-protocol".to_string(),
            payload,
        },
    )
    .await
    .map_err(|e| e.to_string())?;
    if res.ok {
        Ok(res.data)
    } else {
        Err(res.error_message.unwrap_or_else(|| "Ability execution failed".to_string()))
    }
}

/// Run a local policy precheck before ability execution.
pub async fn vincent_precheck_policy(
    app: &AppHandle,
    operation: &str,
    notional_usd: f64,
    protocol: Option<&str>,
    guardrails: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut payload = guardrails.clone();
    payload["operation"] = serde_json::json!(operation);
    payload["notionalUsd"] = serde_json::json!(notional_usd);
    if let Some(p) = protocol {
        payload["protocol"] = serde_json::json!(p);
    }
    let res = invoke_sidecar(
        app,
        RuntimeRequest {
            op: "vincent.precheck_policy".to_string(),
            app_id: "lit-protocol".to_string(),
            payload,
        },
    )
    .await
    .map_err(|e| e.to_string())?;
    if res.ok {
        Ok(res.data)
    } else {
        Err(res.error_message.unwrap_or_else(|| "Policy precheck failed".to_string()))
    }
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
