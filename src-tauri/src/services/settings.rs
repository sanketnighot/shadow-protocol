//! App settings management: secrets (keychain) and non-secrets (sqlite).

use keyring::Entry;

const KEYCHAIN_SERVICE: &str = "com.sanket.shadow";
const PERPLEXITY_KEY_NAME: &str = "api_key:perplexity";
const ALCHEMY_KEY_NAME: &str = "api_key:alchemy";
const OLLAMA_KEY_NAME: &str = "api_key:ollama";

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
