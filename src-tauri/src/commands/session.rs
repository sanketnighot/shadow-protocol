//! Session unlock/lock/status commands for wallet key caching.
//! Supports biometric (Touch ID) unlock when available, with keyring fallback.
//! get_data() enforces Touch ID via SecAccessControl(UserPresence) — no separate
//! authenticate() call needed in the happy path. On the fallback path (no biometry
//! item, e.g. dev builds), this command avoids overlapping unlock attempts and
//! prefers a single secure-storage prompt in debug builds.

use serde::Deserialize;
use serde::Serialize;
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;
use tauri_plugin_biometry::{AuthOptions, BiometryExt, GetDataOptions};
use tracing::warn;

use crate::commands::wallet;
use crate::session;
use crate::services::audit;

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

fn unlocks_in_progress() -> &'static Mutex<HashSet<String>> {
    static UNLOCKS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    UNLOCKS.get_or_init(|| Mutex::new(HashSet::new()))
}

struct UnlockAttemptGuard {
    address: String,
}

impl UnlockAttemptGuard {
    fn acquire(address: &str) -> Result<Self, String> {
        let mut guard = unlocks_in_progress()
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());

        if !guard.insert(address.to_string()) {
            return Err("Unlock already in progress. Please wait for the current prompt.".to_string());
        }

        Ok(Self {
            address: address.to_string(),
        })
    }
}

impl Drop for UnlockAttemptGuard {
    fn drop(&mut self) {
        let mut guard = unlocks_in_progress()
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        guard.remove(&self.address);
    }
}

#[tauri::command]
pub async fn session_unlock(app: AppHandle, input: SessionUnlockInput) -> Result<SessionUnlockResult, String> {
    let address = input.address.trim();
    if address.is_empty() {
        return Err("Address is required".to_string());
    }

    let _unlock_guard = UnlockAttemptGuard::acquire(address)?;

    // Erase all in-memory keys before loading from secure storage.
    session::clear_all();

    let name = biometry_key_name(address);

    // Try biometry store first — get_data() triggers Touch ID via SecAccessControl(UserPresence).
    // If the biometry item exists, this is the ONLY auth prompt the user sees.
    let hex_pk = match app.biometry().get_data(GetDataOptions {
        domain: BIOMETRY_DOMAIN.to_string(),
        name: name.clone(),
        reason: "Unlock your Shadow wallet".to_string(),
        cancel_title: Some("Cancel".to_string()),
    }) {
        Ok(res) => res.data,
        Err(e) => {
            let code = e.to_string();
            if code.contains("authenticationFailed") || code.contains("biometryLockout")
                || code.contains("userCancel")
            {
                audit::record("session_unlock_failed", "wallet", Some(address), &serde_json::json!({
                    "reason": code,
                }));
                return Err(format!("Unlock cancelled or failed: {code}"));
            }

            // itemNotFound: biometry store has no item (dev build or legacy wallet).
            // In debug builds, rely on the keychain prompt directly to avoid stacked
            // auth surfaces from authenticate() + keyring access.
            if !cfg!(debug_assertions) {
                let auth_opts = AuthOptions {
                    allow_device_credential: Some(true),
                    cancel_title: Some("Cancel".to_string()),
                    fallback_title: Some("Use Password".to_string()),
                    ..Default::default()
                };
                if let Err(auth_err) =
                    app.biometry().authenticate("Unlock your Shadow wallet".to_string(), auth_opts)
                {
                    audit::record("session_unlock_failed", "wallet", Some(address), &serde_json::json!({
                        "reason": auth_err.to_string(),
                    }));
                    return Err(format!("Unlock cancelled or failed: {}", auth_err));
                }
            }

            // Auth passed or was intentionally skipped in debug builds — read from keyring
            // and migrate into biometry for the next unlock when supported.
            let pk = wallet::load_private_key(address).map_err(|e| e.to_string())?;
            if let Err(store_err) = wallet::store_in_biometry_pub(&app, address, &pk) {
                warn!(
                    address = %address,
                    "failed to migrate wallet key into biometry store: {store_err}"
                );
                audit::record("session_biometry_store_failed", "wallet", Some(address), &serde_json::json!({
                    "reason": store_err,
                }));
            }
            pk
        }
    };

    session::cache_key(address, hex_pk);
    audit::record("session_unlocked", "wallet", Some(address), &serde_json::json!({}));

    let (locked, expires_at_secs) = session::status(address);
    Ok(SessionUnlockResult {
        locked,
        expires_at_secs,
    })
}

#[cfg(test)]
mod tests {
    use super::{unlocks_in_progress, UnlockAttemptGuard};

    #[test]
    fn unlock_guard_rejects_duplicate_attempts() {
        unlocks_in_progress()
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .clear();

        let first = UnlockAttemptGuard::acquire("0xabc").expect("first guard should acquire");
        let second = UnlockAttemptGuard::acquire("0xabc");
        assert!(second.is_err());

        drop(first);

        let third = UnlockAttemptGuard::acquire("0xabc");
        assert!(third.is_ok());
    }
}

#[tauri::command]
pub fn session_lock(input: SessionLockInput) -> Result<SessionLockResult, String> {
    match input.address {
        Some(addr) => {
            session::clear_key(addr.trim());
            audit::record("session_locked", "wallet", Some(addr.trim()), &serde_json::json!({}));
        }
        None => {
            session::clear_all();
            audit::record("session_locked_all", "session", None, &serde_json::json!({}));
        }
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
