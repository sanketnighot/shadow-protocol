//! Execute token transfers via signed transactions. Uses session-cached keys; RPC is Alchemy or public Filecoin Calibration (Glif).

use ethers::abi::{encode, Token};
use ethers::core::types::{Address, TransactionRequest, U256};
use ethers::middleware::Middleware;
use ethers::middleware::SignerMiddleware;
use ethers::providers::{Http, Provider};
use ethers::signers::{LocalWallet, Signer};
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use tauri::{AppHandle, Emitter};

use crate::session;
use crate::services::chain;

const ERC20_TRANSFER_SELECTOR: [u8; 4] = [0xa9, 0x05, 0x9c, 0xbb];

fn amount_to_wei(amount: f64, decimals: u8) -> Result<U256, TransferError> {
    let factor = 10_f64.powi(decimals as i32);
    let scaled = amount * factor;
    if !scaled.is_finite() || scaled < 0.0 || scaled > u128::MAX as f64 {
        return Err(TransferError::InvalidAmount);
    }
    Ok(U256::from(scaled as u128))
}

#[derive(Debug, thiserror::Error)]
pub enum TransferError {
    #[error("Invalid address")]
    InvalidAddress,
    #[error("Invalid amount")]
    InvalidAmount,
    #[error("Missing ALCHEMY_API_KEY")]
    MissingApiKey,
    #[error("Unsupported chain: {0}")]
    UnsupportedChain(String),
    #[error("Wallet not found for this address")]
    WalletNotFound,
    #[error("Wallet locked — unlock to sign transactions")]
    WalletLocked,
    #[error("Transaction failed: {0}")]
    TransactionFailed(String),
}

impl serde::Serialize for TransferError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferInput {
    pub from_address: String,
    pub to_address: String,
    pub amount: String,
    pub chain: String,
    pub token_contract: Option<String>,
    pub decimals: Option<u8>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferResult {
    pub tx_hash: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferBackgroundResult {
    pub tx_hash: String,
    pub status: String,
}

fn resolve_transfer_rpc_url(chain: &str) -> Result<String, TransferError> {
    let trimmed = chain.trim();
    if trimmed == "FIL-CAL" {
        return chain::chain_to_rpc_url(trimmed, "")
            .ok_or_else(|| TransferError::UnsupportedChain(trimmed.to_string()));
    }
    let api_key =
        crate::services::settings::get_alchemy_key_or_env().ok_or(TransferError::MissingApiKey)?;
    chain::chain_to_rpc_url(trimmed, &api_key)
        .ok_or_else(|| TransferError::UnsupportedChain(trimmed.to_string()))
}

#[tauri::command]
pub async fn portfolio_transfer(input: TransferInput) -> Result<TransferResult, TransferError> {
    let from = input.from_address.trim();
    let to = input.to_address.trim();
    if from.is_empty() || to.is_empty() || !from.starts_with("0x") || !to.starts_with("0x") {
        return Err(TransferError::InvalidAddress);
    }
    if from.len() != 42 || to.len() != 42 {
        return Err(TransferError::InvalidAddress);
    }

    let rpc_url = resolve_transfer_rpc_url(&input.chain)?;

    let hex_pk = session::get_cached_key(from)
        .ok_or(TransferError::WalletLocked)?
        .as_str()
        .to_string();
    session::refresh_expiry(from);

    let wallet: LocalWallet = hex_pk
        .parse()
        .map_err(|_| TransferError::WalletNotFound)?;

    let provider = Provider::<Http>::try_from(&rpc_url)
        .map_err(|e| TransferError::TransactionFailed(e.to_string()))?;
    let chain_id = provider
        .get_chainid()
        .await
        .map_err(|e| TransferError::TransactionFailed(e.to_string()))?;
    let wallet = wallet.with_chain_id(chain_id.as_u64());

    let client = SignerMiddleware::new(provider, wallet);

    let decimals = input.decimals.unwrap_or(18);
    let amount_parsed = input
        .amount
        .trim()
        .parse::<f64>()
        .map_err(|_| TransferError::InvalidAmount)?;
    if !amount_parsed.is_finite() || amount_parsed <= 0.0 {
        return Err(TransferError::InvalidAmount);
    }

    let amount_wei = amount_to_wei(amount_parsed, decimals)?;

    let tx = match input.token_contract.as_deref() {
        None | Some("") => {
            TransactionRequest::new()
                .to(Address::from_str(to).map_err(|_| TransferError::InvalidAddress)?)
                .value(amount_wei)
        }
        Some(contract) => {
            let to_addr = Address::from_str(to).map_err(|_| TransferError::InvalidAddress)?;
            let tokens = [
                Token::Address(to_addr),
                Token::Uint(amount_wei),
            ];
            let mut calldata = ERC20_TRANSFER_SELECTOR.to_vec();
            calldata.extend(encode(&tokens));
            TransactionRequest::new()
                .to(Address::from_str(contract).map_err(|_| TransferError::InvalidAddress)?)
                .data(calldata)
        }
    };

    let pending = client
        .send_transaction(tx, None)
        .await
        .map_err(|e| TransferError::TransactionFailed(e.to_string()))?;

    let receipt = pending
        .await
        .map_err(|e| TransferError::TransactionFailed(e.to_string()))?
        .ok_or_else(|| TransferError::TransactionFailed("Transaction dropped".into()))?;

    let tx_hash = format!("{:?}", receipt.transaction_hash);
    Ok(TransferResult { tx_hash })
}

#[tauri::command]
pub async fn portfolio_transfer_background(
    app: AppHandle,
    input: TransferInput,
) -> Result<TransferBackgroundResult, TransferError> {
    let from = input.from_address.trim();
    let to = input.to_address.trim();
    if from.is_empty() || to.is_empty() || !from.starts_with("0x") || !to.starts_with("0x") {
        return Err(TransferError::InvalidAddress);
    }
    if from.len() != 42 || to.len() != 42 {
        return Err(TransferError::InvalidAddress);
    }

    let rpc_url = resolve_transfer_rpc_url(&input.chain)?;

    let hex_pk = session::get_cached_key(from)
        .ok_or(TransferError::WalletLocked)?
        .as_str()
        .to_string();
    session::refresh_expiry(from);

    let wallet: LocalWallet = hex_pk
        .parse()
        .map_err(|_| TransferError::WalletNotFound)?;

    let provider = Provider::<Http>::try_from(&rpc_url)
        .map_err(|e| TransferError::TransactionFailed(e.to_string()))?;
    let chain_id = provider
        .get_chainid()
        .await
        .map_err(|e| TransferError::TransactionFailed(e.to_string()))?;
    let wallet = wallet.with_chain_id(chain_id.as_u64());

    let client = SignerMiddleware::new(provider, wallet);

    let decimals = input.decimals.unwrap_or(18);
    let amount_parsed = input
        .amount
        .trim()
        .parse::<f64>()
        .map_err(|_| TransferError::InvalidAmount)?;
    if !amount_parsed.is_finite() || amount_parsed <= 0.0 {
        return Err(TransferError::InvalidAmount);
    }

    let amount_wei = amount_to_wei(amount_parsed, decimals)?;

    let tx = match input.token_contract.as_deref() {
        None | Some("") => {
            TransactionRequest::new()
                .to(Address::from_str(to).map_err(|_| TransferError::InvalidAddress)?)
                .value(amount_wei)
        }
        Some(contract) => {
            let to_addr = Address::from_str(to).map_err(|_| TransferError::InvalidAddress)?;
            let tokens = [
                Token::Address(to_addr),
                Token::Uint(amount_wei),
            ];
            let mut calldata = ERC20_TRANSFER_SELECTOR.to_vec();
            calldata.extend(encode(&tokens));
            TransactionRequest::new()
                .to(Address::from_str(contract).map_err(|_| TransferError::InvalidAddress)?)
                .data(calldata)
        }
    };

    let pending = client
        .send_transaction(tx, None)
        .await
        .map_err(|e| TransferError::TransactionFailed(e.to_string()))?;

    let tx_hash = format!("{:?}", pending.tx_hash());
    let tx_hash_emit = tx_hash.clone();
    let rpc_url_poll = rpc_url.clone();

    let handle = app.clone();
    tokio::spawn(async move {
        let hash: ethers::core::types::H256 = tx_hash_emit
            .trim_matches('"')
            .parse()
            .unwrap_or_else(|_| ethers::core::types::H256::zero());
        let mut receipt = None;
        if let Ok(provider) = Provider::<Http>::try_from(rpc_url_poll.as_str()) {
            for _ in 0..60 {
                if let Ok(Some(r)) = provider.get_transaction_receipt(hash).await {
                    receipt = Some(r);
                    break;
                }
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            }
        }

        let payload = match receipt {
            Some(_) => serde_json::json!({
                "txHash": tx_hash_emit,
                "status": "confirmed"
            }),
            None => serde_json::json!({
                "txHash": tx_hash_emit,
                "status": "failed",
                "error": "Transaction dropped or timeout"
            }),
        };
        let _ = handle.emit("tx_confirmation", payload);
    });

    Ok(TransferBackgroundResult {
        tx_hash,
        status: "pending".to_string(),
    })
}
