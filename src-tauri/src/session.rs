//! In-memory session cache for decrypted private keys. Keys stored in RAM only with 30-min inactivity expiry.

use std::collections::HashMap;
use std::sync::{RwLock, OnceLock};
use std::time::{Duration, Instant};
use zeroize::Zeroizing;

const INACTIVITY_SECS: u64 = 30 * 60;

#[derive(Clone)]
struct CachedKey {
    hex_pk: Zeroizing<String>,
    expires_at: Instant,
}

fn cache() -> &'static RwLock<HashMap<String, CachedKey>> {
    static CACHE: OnceLock<RwLock<HashMap<String, CachedKey>>> = OnceLock::new();
    CACHE.get_or_init(|| RwLock::new(HashMap::new()))
}

fn extend_expiry() -> Instant {
    Instant::now() + Duration::from_secs(INACTIVITY_SECS)
}

fn prune_expired_locked(guard: &mut HashMap<String, CachedKey>) {
    let now = Instant::now();
    guard.retain(|_, cached| cached.expires_at >= now);
}

/// Returns cached key if present and not expired. Refreshes expiry on use.
pub fn get_cached_key(address: &str) -> Option<Zeroizing<String>> {
    let mut guard = cache().write().ok()?;
    prune_expired_locked(&mut guard);
    let cached = guard.get_mut(address)?;
    cached.expires_at = extend_expiry();
    Some(cached.hex_pk.clone())
}

/// Refreshes expiry for a cached key. Call after successful transfer.
pub fn refresh_expiry(address: &str) {
    let mut guard = match cache().write() {
        Ok(g) => g,
        Err(_) => return,
    };
    if let Some(cached) = guard.get_mut(address) {
        cached.expires_at = extend_expiry();
    }
}

/// Caches a key for the given address.
pub fn cache_key(address: &str, hex_pk: String) {
    let mut guard = match cache().write() {
        Ok(g) => g,
        Err(_) => return,
    };
    prune_expired_locked(&mut guard);
    // Only one actively unlocked wallet is retained at a time.
    guard.clear();
    guard.insert(
        address.to_string(),
        CachedKey {
            hex_pk: Zeroizing::new(hex_pk),
            expires_at: extend_expiry(),
        },
    );
}

/// Clears cached key for address. Uses zeroize for secure wipe.
pub fn clear_key(address: &str) {
    let mut guard = match cache().write() {
        Ok(g) => g,
        Err(_) => return,
    };
    guard.remove(address);
}

/// Clears all cached keys. Called on lock and app quit.
pub fn clear_all() {
    let mut guard = match cache().write() {
        Ok(g) => g,
        Err(_) => return,
    };
    guard.clear();
}

/// Returns (locked, expires_at_secs). locked=true if no valid cache.
pub fn status(address: &str) -> (bool, Option<u64>) {
    let mut write_guard = match cache().write() {
        Ok(g) => g,
        Err(_) => return (true, None),
    };
    prune_expired_locked(&mut write_guard);
    let Some(cached) = write_guard.get(address) else {
        return (true, None);
    };
    let secs = (cached.expires_at - Instant::now()).as_secs();
    (false, Some(secs))
}

pub fn prune_expired() {
    let mut guard = match cache().write() {
        Ok(g) => g,
        Err(_) => return,
    };
    prune_expired_locked(&mut guard);
}

/// True when any wallet session has an unexpired cached key (used for sensitive app settings).
pub fn has_unlocked_session() -> bool {
    let mut guard = match cache().write() {
        Ok(g) => g,
        Err(_) => return false,
    };
    prune_expired_locked(&mut guard);
    !guard.is_empty()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn has_unlocked_false_when_empty() {
        clear_all();
        assert!(!has_unlocked_session());
    }

    #[test]
    fn has_unlocked_true_after_cache() {
        clear_all();
        cache_key("0xtest", "00".to_string());
        assert!(has_unlocked_session());
        clear_all();
    }
}
