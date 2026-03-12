//! EVM wallet create/import/list/remove.
//! Private keys stored in OS Keychain and biometry (Touch ID protected).
//! Address list stored in a plain JSON file — not Keychain — to avoid password prompts on startup.

use bip39::Mnemonic;
use ethers::signers::{coins_bip39::English, LocalWallet, MnemonicBuilder, Signer};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use tauri::{AppHandle, Manager};
use tauri_plugin_biometry::{BiometryExt, DataOptions, SetDataOptions};

const KEYCHAIN_SERVICE: &str = "com.sanket.shadow";
/// Legacy key used when addresses were stored in Keychain. Kept only for one-time migration.
const LEGACY_ADDRESSES_KEY: &str = "wallet:addresses";
const BIOMETRY_DOMAIN: &str = "com.sanket.shadow";

#[derive(Debug, thiserror::Error)]
pub enum WalletError {
    #[error("Invalid mnemonic phrase")]
    InvalidMnemonic,
    #[error("Invalid private key")]
    InvalidPrivateKey,
    #[error("Keychain error: {0}")]
    Keychain(#[from] keyring::Error),
    #[error("Wallet not found")]
    NotFound,
}

impl serde::Serialize for WalletError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CreateWalletInput {
    pub word_count: Option<u8>,
}

#[derive(Debug, Serialize)]
pub struct CreateWalletResult {
    pub address: String,
    pub mnemonic: String,
}

#[derive(Debug, Deserialize)]
pub struct ImportMnemonicInput {
    pub mnemonic: String,
}

#[derive(Debug, Deserialize)]
pub struct ImportPrivateKeyInput {
    pub private_key: String,
}

#[derive(Debug, Serialize)]
pub struct ImportWalletResult {
    pub address: String,
}

#[derive(Debug, Serialize)]
pub struct WalletListResult {
    pub addresses: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct RemoveWalletInput {
    pub address: String,
}

#[derive(Debug, Serialize)]
pub struct RemoveWalletResult {
    pub success: bool,
}

/// Returns path to the addresses JSON file in the app's data directory.
/// The addresses list is public (not secret) so we don't need Keychain for it.
fn addresses_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("wallets.json"))
}

fn load_addresses(app: &AppHandle) -> Vec<String> {
    let Some(path) = addresses_path(app) else {
        return Vec::new();
    };
    if let Ok(content) = std::fs::read_to_string(&path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        // One-time migration from legacy Keychain storage (no password needed, it's just reading
        // the entry — though macOS might prompt once). After migration, the file is used.
        if let Ok(entry) = Entry::new(KEYCHAIN_SERVICE, LEGACY_ADDRESSES_KEY) {
            if let Ok(s) = entry.get_password() {
                let addrs: Vec<String> = serde_json::from_str(&s).unwrap_or_default();
                let _ = save_addresses_to_path(&path, &addrs);
                // Best-effort: remove old Keychain entry so it never prompts again
                let _ = entry.delete_password();
                return addrs;
            }
        }
        Vec::new()
    }
}

fn save_addresses_to_path(path: &std::path::Path, addresses: &[String]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string(addresses).expect("addresses serializable");
    std::fs::write(path, json)
}

fn save_addresses(app: &AppHandle, addresses: &[String]) {
    if let Some(path) = addresses_path(app) {
        let _ = save_addresses_to_path(&path, addresses);
    }
}

fn store_private_key(address: &str, hex_pk: &str) -> Result<(), WalletError> {
    let entry = Entry::new(KEYCHAIN_SERVICE, &format!("wallet:{}", address))?;
    entry.set_password(hex_pk)?;
    Ok(())
}

/// Stores the key in the biometry (Touch ID) protected keychain.
/// On signed production builds, this stores in Touch ID secured Keychain.
/// On dev/unsigned builds, this may silently fail — unlock falls back to Keychain password.
fn store_in_biometry(app: &AppHandle, address: &str, hex_pk: &str) {
    let _ = app.biometry().set_data(SetDataOptions {
        domain: BIOMETRY_DOMAIN.to_string(),
        name: format!("wallet:{}", address),
        data: hex_pk.to_string(),
    });
}

fn remove_from_biometry(app: &AppHandle, address: &str) {
    let _ = app.biometry().remove_data(DataOptions {
        domain: BIOMETRY_DOMAIN.to_string(),
        name: format!("wallet:{}", address),
    });
}

fn remove_private_key(address: &str) -> Result<(), WalletError> {
    let entry = Entry::new(KEYCHAIN_SERVICE, &format!("wallet:{}", address))?;
    entry.delete_password()?;
    Ok(())
}

/// Load private key from Keychain. Triggers OS password prompt. Used as fallback in session_unlock.
pub fn load_private_key(address: &str) -> Result<String, WalletError> {
    let entry = Entry::new(KEYCHAIN_SERVICE, &format!("wallet:{}", address))?;
    entry.get_password().map_err(Into::into)
}

#[tauri::command]
pub fn wallet_create(app: AppHandle, input: CreateWalletInput) -> Result<CreateWalletResult, WalletError> {
    let word_count = input.word_count.unwrap_or(12);
    if word_count != 12 && word_count != 24 {
        return Err(WalletError::InvalidMnemonic);
    }

    let mnemonic = Mnemonic::generate_in(bip39::Language::English, word_count as usize)
        .map_err(|_| WalletError::InvalidMnemonic)?;
    let phrase = mnemonic.to_string();

    let wallet: LocalWallet = MnemonicBuilder::<English>::default()
        .phrase(phrase.as_str())
        .index(0u32)
        .map_err(|_| WalletError::InvalidMnemonic)?
        .build()
        .map_err(|_| WalletError::InvalidMnemonic)?;

    let address = format!("{:?}", wallet.address());
    let hex_pk = format!("0x{}", hex::encode(wallet.signer().to_bytes()));

    store_private_key(&address, &hex_pk)?;
    store_in_biometry(&app, &address, &hex_pk);

    let mut addrs = load_addresses(&app);
    if !addrs.contains(&address) {
        addrs.push(address.clone());
        save_addresses(&app, &addrs);
    }

    Ok(CreateWalletResult { address, mnemonic: phrase })
}

#[tauri::command]
pub fn wallet_import_mnemonic(app: AppHandle, input: ImportMnemonicInput) -> Result<ImportWalletResult, WalletError> {
    let phrase = input.mnemonic.trim().to_lowercase();
    if phrase.is_empty() {
        return Err(WalletError::InvalidMnemonic);
    }

    let wallet: LocalWallet = MnemonicBuilder::<English>::default()
        .phrase(phrase.as_str())
        .index(0u32)
        .map_err(|_| WalletError::InvalidMnemonic)?
        .build()
        .map_err(|_| WalletError::InvalidMnemonic)?;

    let address = format!("{:?}", wallet.address());
    let hex_pk = format!("0x{}", hex::encode(wallet.signer().to_bytes()));

    store_private_key(&address, &hex_pk)?;
    store_in_biometry(&app, &address, &hex_pk);

    let mut addrs = load_addresses(&app);
    if !addrs.contains(&address) {
        addrs.push(address.clone());
        save_addresses(&app, &addrs);
    }

    Ok(ImportWalletResult { address })
}

#[tauri::command]
pub fn wallet_import_private_key(
    app: AppHandle,
    input: ImportPrivateKeyInput,
) -> Result<ImportWalletResult, WalletError> {
    let s = input.private_key.trim();
    let s = s.strip_prefix("0x").unwrap_or(s);
    if s.len() != 64 || !s.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(WalletError::InvalidPrivateKey);
    }

    let wallet = LocalWallet::from_str(&format!("0x{}", s))
        .map_err(|_| WalletError::InvalidPrivateKey)?;

    let address = format!("{:?}", wallet.address());
    let hex_pk = format!("0x{}", hex::encode(wallet.signer().to_bytes()));

    store_private_key(&address, &hex_pk)?;
    store_in_biometry(&app, &address, &hex_pk);

    let mut addrs = load_addresses(&app);
    if !addrs.contains(&address) {
        addrs.push(address.clone());
        save_addresses(&app, &addrs);
    }

    Ok(ImportWalletResult { address })
}

#[tauri::command]
pub fn wallet_list(app: AppHandle) -> Result<WalletListResult, WalletError> {
    let addresses = load_addresses(&app);
    Ok(WalletListResult { addresses })
}

#[tauri::command]
pub fn wallet_remove(app: AppHandle, input: RemoveWalletInput) -> Result<RemoveWalletResult, WalletError> {
    let address = input.address.trim();
    if address.is_empty() {
        return Err(WalletError::NotFound);
    }

    let mut addrs = load_addresses(&app);
    if let Some(pos) = addrs.iter().position(|a| a == address) {
        addrs.remove(pos);
        save_addresses(&app, &addrs);
    }

    let _ = remove_private_key(address);
    remove_from_biometry(&app, address);

    Ok(RemoveWalletResult { success: true })
}
