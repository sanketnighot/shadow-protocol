//! Session unlock/lock/status commands for wallet key caching.
//! Supports biometric (Touch ID) unlock when available, with keyring fallback.

use serde::Deserialize;
use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_biometry::{AuthOptions, BiometryExt, GetDataOptions};

use crate::commands::wallet;
use crate::session;

const BIOMETRY_DOMAIN: &str = "com.sanket.shadow";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUnlockInput {
    pub address: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUnlockResult {
    pub locked: bool,
    pub expires_at_secs: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionLockInput {
    pub address: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionLockResult {
    pub locked: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatusInput {
    pub address: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatusResult {
    pub locked: bool,
    pub expires_at_secs: Option<u64>,
}

fn biometry_key_name(address: &str) -> String {
    format!("wallet:{}", address)
}

#[tauri::command]
pub async fn session_unlock(app: AppHandle, input: SessionUnlockInput) -> Result<SessionUnlockResult, String> {
    let address = input.address.trim();
    if address.is_empty() {
        return Err("Address is required".to_string());
    }

    // Erase all in-memory keys before loading from secure storage.
    session::clear_all();

    // Always require Touch ID or device password before any key access.
    // Keychain can return keys without prompting when Mac is unlocked; this forces auth every time.
    let auth_opts = AuthOptions {
        allow_device_credential: Some(true),
        cancel_title: Some("Use Password".to_string()),
        fallback_title: Some("Use Password".to_string()),
        ..Default::default()
    };
    if let Err(auth_err) =
        app.biometry().authenticate("Unlock your Shadow wallet".to_string(), auth_opts)
    {
        return Err(auth_err.to_string());
    }

    let name = biometry_key_name(address);

    // Try biometry store first, then Keychain.
    let hex_pk = match app.biometry().get_data(GetDataOptions {
        domain: BIOMETRY_DOMAIN.to_string(),
        name: name.clone(),
        reason: "Unlock your Shadow wallet".to_string(),
        cancel_title: Some("Use Password".to_string()),
    }) {
        Ok(res) => res.data,
        Err(e) => {
            let code = e.to_string();
            if code.contains("authenticationFailed") || code.contains("biometryLockout") {
                return Err(format!("Biometric unlock failed: {code}"));
            }
            // itemNotFound / dev build: key only in Keychain (authenticate already passed above).
            wallet::load_private_key(address).map_err(|e| e.to_string())?
        }
    };

    session::cache_key(address, hex_pk);

    let (locked, expires_at_secs) = session::status(address);
    Ok(SessionUnlockResult {
        locked,
        expires_at_secs,
    })
}

#[tauri::command]
pub fn session_lock(input: SessionLockInput) -> Result<SessionLockResult, String> {
    match input.address {
        Some(addr) => session::clear_key(addr.trim()),
        None => session::clear_all(),
    }
    Ok(SessionLockResult { locked: true })
}

#[tauri::command]
pub fn session_status(input: SessionStatusInput) -> Result<SessionStatusResult, String> {
    let address = input.address.trim();
    if address.is_empty() {
        return Err("Address is required".to_string());
    }

    let (locked, expires_at_secs) = session::status(address);
    Ok(SessionStatusResult {
        locked,
        expires_at_secs,
    })
}
