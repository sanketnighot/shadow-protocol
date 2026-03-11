//! EVM wallet create/import/list/remove. Keys stored in OS keychain only.

use bip39::Mnemonic;
use ethers::signers::{coins_bip39::English, LocalWallet, MnemonicBuilder, Signer};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

const KEYCHAIN_SERVICE: &str = "com.sanket.shadow";
const ADDRESSES_KEY: &str = "wallet:addresses";

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

fn load_addresses() -> Result<Vec<String>, WalletError> {
    let entry = Entry::new(KEYCHAIN_SERVICE, ADDRESSES_KEY)?;
    match entry.get_password() {
        Ok(s) => {
            let addrs: Vec<String> = serde_json::from_str(&s).unwrap_or_default();
            Ok(addrs)
        }
        Err(e) if matches!(e, keyring::Error::NoEntry) => Ok(Vec::new()),
        Err(e) => Err(e.into()),
    }
}

fn save_addresses(addresses: &[String]) -> Result<(), WalletError> {
    let entry = Entry::new(KEYCHAIN_SERVICE, ADDRESSES_KEY)?;
    let json = serde_json::to_string(addresses).expect("addresses serializable");
    entry.set_password(&json)?;
    Ok(())
}

fn store_private_key(address: &str, hex_pk: &str) -> Result<(), WalletError> {
    let entry = Entry::new(KEYCHAIN_SERVICE, &format!("wallet:{}", address))?;
    entry.set_password(hex_pk)?;
    Ok(())
}

fn remove_private_key(address: &str) -> Result<(), WalletError> {
    let entry = Entry::new(KEYCHAIN_SERVICE, &format!("wallet:{}", address))?;
    entry.delete_password()?;
    Ok(())
}

#[tauri::command]
pub fn wallet_create(input: CreateWalletInput) -> Result<CreateWalletResult, WalletError> {
    let word_count = input.word_count.unwrap_or(12);
    if word_count != 12 && word_count != 24 {
        return Err(WalletError::InvalidMnemonic);
    }

    let mnemonic = Mnemonic::generate_in(
        bip39::Language::English,
        word_count as usize,
    ).map_err(|_| WalletError::InvalidMnemonic)?;
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

    let mut addrs = load_addresses()?;
    if !addrs.contains(&address) {
        addrs.push(address.clone());
        save_addresses(&addrs)?;
    }

    Ok(CreateWalletResult {
        address: address.clone(),
        mnemonic: phrase,
    })
}

#[tauri::command]
pub fn wallet_import_mnemonic(input: ImportMnemonicInput) -> Result<ImportWalletResult, WalletError> {
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

    let mut addrs = load_addresses()?;
    if !addrs.contains(&address) {
        addrs.push(address.clone());
        save_addresses(&addrs)?;
    }

    Ok(ImportWalletResult { address })
}

#[tauri::command]
pub fn wallet_import_private_key(
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

    let mut addrs = load_addresses()?;
    if !addrs.contains(&address) {
        addrs.push(address.clone());
        save_addresses(&addrs)?;
    }

    Ok(ImportWalletResult { address })
}

#[tauri::command]
pub fn wallet_list() -> Result<WalletListResult, WalletError> {
    let addresses = load_addresses()?;
    Ok(WalletListResult { addresses })
}

#[tauri::command]
pub fn wallet_remove(input: RemoveWalletInput) -> Result<RemoveWalletResult, WalletError> {
    let address = input.address.trim();
    if address.is_empty() {
        return Err(WalletError::NotFound);
    }

    let mut addrs = load_addresses()?;
    if let Some(pos) = addrs.iter().position(|a| a == address) {
        addrs.remove(pos);
        save_addresses(&addrs)?;
    }

    let _ = remove_private_key(address);

    Ok(RemoveWalletResult { success: true })
}
