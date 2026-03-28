//! App settings management: secrets (keychain) and non-secrets (sqlite).

use keyring::Entry;
use tauri::{AppHandle, Manager};
use tauri_plugin_biometry::BiometryExt;
use tauri_plugin_biometry::{DataOptions};

const KEYCHAIN_SERVICE: &str = "com.sanket.shadow";
const PERPLEXITY_KEY_NAME: &str = "api_key:perplexity";
const ALCHEMY_KEY_NAME: &str = "api_key:alchemy";
const OLLAMA_KEY_NAME: &str = "api_key:ollama";
const BIOMETRY_DOMAIN: &str = "com.sanket.shadow.biometry";

fn app_secret_entry_name(app_id: &str, key: &str) -> String {
    format!("app_secret:{app_id}:{key}")
}

pub fn set_app_secret(app_id: &str, key: &str, value: &str) -> Result<(), keyring::Error> {
    let entry = Entry::new(KEYCHAIN_SERVICE, &app_secret_entry_name(app_id, key))?;
    entry.set_password(value)?;
    Ok(())
}

pub fn get_app_secret(app_id: &str, key: &str) -> Result<Option<String>, keyring::Error> {
    let entry = Entry::new(KEYCHAIN_SERVICE, &app_secret_entry_name(app_id, key))?;
    match entry.get_password() {
        Ok(s) => Ok(Some(s)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn remove_app_secret(app_id: &str, key: &str) -> Result<(), keyring::Error> {
    if let Ok(entry) = Entry::new(KEYCHAIN_SERVICE, &app_secret_entry_name(app_id, key)) {
        let _ = entry.delete_password();
    }
    Ok(())
}

pub fn remove_app_secrets_for(app_id: &str) -> Result<(), keyring::Error> {
    for key in ["api_token", "access_key", "rpc_override", "dek"] {
        let _ = remove_app_secret(app_id, key);
    }
    Ok(())
}

pub fn set_perplexity_key(key: &str) -> Result<(), keyring::Error> {
    let entry = Entry::new(KEYCHAIN_SERVICE, PERPLEXITY_KEY_NAME)?;
    entry.set_password(key)?;
    Ok(())
}

pub fn get_perplexity_key() -> Result<Option<String>, keyring::Error> {
    let entry = Entry::new(KEYCHAIN_SERVICE, PERPLEXITY_KEY_NAME)?;
    match entry.get_password() {
        Ok(s) => Ok(Some(s)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn remove_perplexity_key() -> Result<(), keyring::Error> {
    let entry = Entry::new(KEYCHAIN_SERVICE, PERPLEXITY_KEY_NAME)?;
    let _ = entry.delete_password();
    Ok(())
}

pub fn set_alchemy_key(key: &str) -> Result<(), keyring::Error> {
    let entry = Entry::new(KEYCHAIN_SERVICE, ALCHEMY_KEY_NAME)?;
    entry.set_password(key)?;
    Ok(())
}

pub fn get_alchemy_key() -> Result<Option<String>, keyring::Error> {
    let entry = Entry::new(KEYCHAIN_SERVICE, ALCHEMY_KEY_NAME)?;
    match entry.get_password() {
        Ok(s) => Ok(Some(s)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn remove_alchemy_key() -> Result<(), keyring::Error> {
    let entry = Entry::new(KEYCHAIN_SERVICE, ALCHEMY_KEY_NAME)?;
    let _ = entry.delete_password();
    Ok(())
}

pub fn set_ollama_key(key: &str) -> Result<(), keyring::Error> {
    let entry = Entry::new(KEYCHAIN_SERVICE, OLLAMA_KEY_NAME)?;
    entry.set_password(key)?;
    Ok(())
}

pub fn get_ollama_key() -> Result<Option<String>, keyring::Error> {
    let entry = Entry::new(KEYCHAIN_SERVICE, OLLAMA_KEY_NAME)?;
    match entry.get_password() {
        Ok(s) => Ok(Some(s)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn remove_ollama_key() -> Result<(), keyring::Error> {
    let entry = Entry::new(KEYCHAIN_SERVICE, OLLAMA_KEY_NAME)?;
    let _ = entry.delete_password();
    Ok(())
}

/// Returns the alchemy key from keychain, or falls back to env var ALCHEMY_API_KEY.
pub fn get_alchemy_key_or_env() -> Option<String> {
    get_alchemy_key().ok().flatten().or_else(|| std::env::var("ALCHEMY_API_KEY").ok())
}

/// Deletes ALL application data: DB, Keychain, Session, and local files.
pub async fn delete_all_app_data(app: &AppHandle) -> Result<(), String> {
    // 1. Get addresses to clear their specific keychain entries
    let addresses = crate::commands::get_addresses(app);

    // 2. Clear Keychain entries (API Keys)
    let _ = remove_perplexity_key();
    let _ = remove_alchemy_key();
    let _ = remove_ollama_key();
    for app_id in ["lit-protocol", "flow", "filecoin-storage"] {
        let _ = remove_app_secrets_for(app_id);
    }

    // 3. Clear Wallet entries from Keychain and Biometry
    for addr in addresses {
        let name = format!("wallet:{}", addr);
        if let Ok(entry) = Entry::new(KEYCHAIN_SERVICE, &name) {
            let _ = entry.delete_password();
        }
        let _ = app.biometry().remove_data(DataOptions {
            domain: BIOMETRY_DOMAIN.to_string(),
            name,
        });
    }

    // 4. Clear in-memory session cache
    crate::session::clear_all();

    // 5. Truncate SQLite database
    super::local_db::clear_all_data().map_err(|e| e.to_string())?;

    // 6. Delete addresses file
    if let Ok(dir) = app.path().app_data_dir() {
        let path: std::path::PathBuf = dir.join("wallets.json");
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
    }

    Ok(())
}
