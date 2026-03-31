//! App settings management: secrets (keychain) and non-secrets (sqlite).
//! Secrets use a single-flight in-memory cache so concurrent first reads share
//! one keychain fetch instead of triggering multiple macOS prompts.

use keyring::Entry;
use std::collections::HashMap;
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use tauri::{AppHandle, Manager};
use tauri_plugin_biometry::BiometryExt;
use tauri_plugin_biometry::{DataOptions};

const KEYCHAIN_SERVICE: &str = "com.sanket.shadow";
const PERPLEXITY_KEY_NAME: &str = "api_key:perplexity";
const ALCHEMY_KEY_NAME: &str = "api_key:alchemy";
const OLLAMA_KEY_NAME: &str = "api_key:ollama";
const BIOMETRY_DOMAIN: &str = "com.sanket.shadow";

// ---------------------------------------------------------------------------
// In-memory secret caches
// ---------------------------------------------------------------------------
#[derive(Clone, Debug, PartialEq, Eq)]
enum SecretLoadState {
    Uninitialized,
    Loading,
    Loaded(Option<String>),
}

struct SecretCacheSlot {
    state: Mutex<SecretLoadState>,
    ready: Condvar,
}

impl SecretCacheSlot {
    fn new() -> Self {
        Self {
            state: Mutex::new(SecretLoadState::Uninitialized),
            ready: Condvar::new(),
        }
    }

    fn load_with<E, F>(&self, loader: F) -> Result<Option<String>, E>
    where
        F: FnOnce() -> Result<Option<String>, E>,
    {
        let mut loader = Some(loader);

        loop {
            let mut state = self
                .state
                .lock()
                .unwrap_or_else(|poison| poison.into_inner());

            match &*state {
                SecretLoadState::Loaded(value) => return Ok(value.clone()),
                SecretLoadState::Loading => {
                    state = self
                        .ready
                        .wait(state)
                        .unwrap_or_else(|poison| poison.into_inner());
                    drop(state);
                }
                SecretLoadState::Uninitialized => {
                    *state = SecretLoadState::Loading;
                    drop(state);

                    let result = loader.take().expect("secret loader should only run once")();

                    let mut state = self
                        .state
                        .lock()
                        .unwrap_or_else(|poison| poison.into_inner());
                    match &result {
                        Ok(value) => *state = SecretLoadState::Loaded(value.clone()),
                        Err(_) => *state = SecretLoadState::Uninitialized,
                    }
                    self.ready.notify_all();

                    return result;
                }
            }
        }
    }

    fn store_loaded(&self, value: Option<String>) {
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        *state = SecretLoadState::Loaded(value);
        self.ready.notify_all();
    }
}

struct ApiKeyCache {
    alchemy: SecretCacheSlot,
    perplexity: SecretCacheSlot,
    ollama: SecretCacheSlot,
}

static API_CACHE: OnceLock<ApiKeyCache> = OnceLock::new();

fn cache() -> &'static ApiKeyCache {
    API_CACHE.get_or_init(|| ApiKeyCache {
        alchemy: SecretCacheSlot::new(),
        perplexity: SecretCacheSlot::new(),
        ollama: SecretCacheSlot::new(),
    })
}

struct AppSecretCache {
    slots: Mutex<HashMap<String, Arc<SecretCacheSlot>>>,
}

static APP_SECRET_CACHE: OnceLock<AppSecretCache> = OnceLock::new();

fn app_secret_cache() -> &'static AppSecretCache {
    APP_SECRET_CACHE.get_or_init(|| AppSecretCache {
        slots: Mutex::new(HashMap::new()),
    })
}

fn app_secret_entry_name(app_id: &str, key: &str) -> String {
    format!("app_secret:{app_id}:{key}")
}

fn app_secret_slot(app_id: &str, key: &str) -> Arc<SecretCacheSlot> {
    let cache_key = app_secret_entry_name(app_id, key);
    let mut slots = app_secret_cache()
        .slots
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());

    slots
        .entry(cache_key)
        .or_insert_with(|| Arc::new(SecretCacheSlot::new()))
        .clone()
}

fn read_secret(entry_name: &str) -> Result<Option<String>, keyring::Error> {
    let entry = Entry::new(KEYCHAIN_SERVICE, entry_name)?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn set_app_secret(app_id: &str, key: &str, value: &str) -> Result<(), keyring::Error> {
    let entry_name = app_secret_entry_name(app_id, key);
    let entry = Entry::new(KEYCHAIN_SERVICE, &entry_name)?;
    entry.set_password(value)?;
    app_secret_slot(app_id, key).store_loaded(Some(value.to_string()));
    Ok(())
}

pub fn get_app_secret(app_id: &str, key: &str) -> Result<Option<String>, keyring::Error> {
    app_secret_slot(app_id, key).load_with(|| read_secret(&app_secret_entry_name(app_id, key)))
}

pub fn remove_app_secret(app_id: &str, key: &str) -> Result<(), keyring::Error> {
    if let Ok(entry) = Entry::new(KEYCHAIN_SERVICE, &app_secret_entry_name(app_id, key)) {
        let _ = entry.delete_password();
    }
    app_secret_slot(app_id, key).store_loaded(None);
    Ok(())
}

pub fn remove_app_secrets_for(app_id: &str) -> Result<(), keyring::Error> {
    for key in [
        "api_token",
        "access_key",
        "rpc_override",
        "dek",
        "filecoinApiKey",
        "delegateeKey",
    ] {
        let _ = remove_app_secret(app_id, key);
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Perplexity key (cached)
// ---------------------------------------------------------------------------

pub fn set_perplexity_key(key: &str) -> Result<(), keyring::Error> {
    let entry = Entry::new(KEYCHAIN_SERVICE, PERPLEXITY_KEY_NAME)?;
    entry.set_password(key)?;
    cache().perplexity.store_loaded(Some(key.to_string()));
    Ok(())
}

pub fn get_perplexity_key() -> Result<Option<String>, keyring::Error> {
    cache()
        .perplexity
        .load_with(|| read_secret(PERPLEXITY_KEY_NAME))
}

pub fn remove_perplexity_key() -> Result<(), keyring::Error> {
    let entry = Entry::new(KEYCHAIN_SERVICE, PERPLEXITY_KEY_NAME)?;
    let _ = entry.delete_password();
    cache().perplexity.store_loaded(None);
    Ok(())
}

// ---------------------------------------------------------------------------
// Alchemy key (cached)
// ---------------------------------------------------------------------------

pub fn set_alchemy_key(key: &str) -> Result<(), keyring::Error> {
    let entry = Entry::new(KEYCHAIN_SERVICE, ALCHEMY_KEY_NAME)?;
    entry.set_password(key)?;
    cache().alchemy.store_loaded(Some(key.to_string()));
    Ok(())
}

pub fn get_alchemy_key() -> Result<Option<String>, keyring::Error> {
    cache().alchemy.load_with(|| read_secret(ALCHEMY_KEY_NAME))
}

pub fn remove_alchemy_key() -> Result<(), keyring::Error> {
    let entry = Entry::new(KEYCHAIN_SERVICE, ALCHEMY_KEY_NAME)?;
    let _ = entry.delete_password();
    cache().alchemy.store_loaded(None);
    Ok(())
}

// ---------------------------------------------------------------------------
// Ollama key (cached)
// ---------------------------------------------------------------------------

pub fn set_ollama_key(key: &str) -> Result<(), keyring::Error> {
    let entry = Entry::new(KEYCHAIN_SERVICE, OLLAMA_KEY_NAME)?;
    entry.set_password(key)?;
    cache().ollama.store_loaded(Some(key.to_string()));
    Ok(())
}

pub fn get_ollama_key() -> Result<Option<String>, keyring::Error> {
    cache().ollama.load_with(|| read_secret(OLLAMA_KEY_NAME))
}

pub fn remove_ollama_key() -> Result<(), keyring::Error> {
    let entry = Entry::new(KEYCHAIN_SERVICE, OLLAMA_KEY_NAME)?;
    let _ = entry.delete_password();
    cache().ollama.store_loaded(None);
    Ok(())
}

/// Returns the alchemy key from cache/keychain, or falls back to env var ALCHEMY_API_KEY.
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

#[cfg(test)]
mod tests {
    use super::{app_secret_slot, SecretCacheSlot};
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Barrier,
    };
    use std::thread;
    use std::time::Duration;

    #[test]
    fn singleflight_loader_runs_once_for_parallel_reads() {
        let slot = Arc::new(SecretCacheSlot::new());
        let loader_calls = Arc::new(AtomicUsize::new(0));
        let start = Arc::new(Barrier::new(5));
        let mut handles = Vec::new();

        for _ in 0..4 {
            let slot = slot.clone();
            let loader_calls = loader_calls.clone();
            let start = start.clone();
            handles.push(thread::spawn(move || {
                start.wait();
                slot.load_with(|| {
                    loader_calls.fetch_add(1, Ordering::SeqCst);
                    thread::sleep(Duration::from_millis(50));
                    Ok::<Option<String>, &'static str>(Some("secret".to_string()))
                })
            }));
        }

        start.wait();

        for handle in handles {
            let value = handle.join().expect("thread should join").expect("load should succeed");
            assert_eq!(value.as_deref(), Some("secret"));
        }

        assert_eq!(loader_calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn failed_load_is_not_cached() {
        let slot = SecretCacheSlot::new();
        let loader_calls = AtomicUsize::new(0);

        let first = slot.load_with(|| {
            loader_calls.fetch_add(1, Ordering::SeqCst);
            Err::<Option<String>, &'static str>("boom")
        });
        assert!(first.is_err());

        let second = slot
            .load_with(|| {
                loader_calls.fetch_add(1, Ordering::SeqCst);
                Ok::<Option<String>, &'static str>(Some("secret".to_string()))
            })
            .expect("second load should succeed");

        assert_eq!(second.as_deref(), Some("secret"));
        assert_eq!(loader_calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn app_secret_slots_are_reused_per_secret_name() {
        let first = app_secret_slot("lit-protocol", "delegateeKey");
        let second = app_secret_slot("lit-protocol", "delegateeKey");
        let third = app_secret_slot("lit-protocol", "api_token");

        assert!(Arc::ptr_eq(&first, &second));
        assert!(!Arc::ptr_eq(&first, &third));
    }
}
