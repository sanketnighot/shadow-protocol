//! Swap execution via 0x Swap API (allowance-holder). Mirrors the pattern in transfer.rs.

use ethers::core::types::{Address, Bytes, TransactionRequest, U256};
use ethers::middleware::Middleware;
use ethers::middleware::SignerMiddleware;
use ethers::providers::{Http, Provider};
use ethers::signers::{LocalWallet, Signer};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

use crate::services::chain;
use crate::session;

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum SwapError {
    #[error("Missing 0x API key — add it in Settings → API Keys")]
    MissingApiKey,
    #[error("Missing Alchemy API key")]
    MissingAlchemyKey,
    #[error("Invalid address")]
    InvalidAddress,
    #[error("Unsupported chain: {0}")]
    UnsupportedChain(String),
    #[error("Wallet not found for this address")]
    WalletNotFound,
    #[error("Wallet locked — unlock to sign transactions")]
    WalletLocked,
    #[error("0x quote failed: {0}")]
    QuoteFailed(String),
    #[error("Transaction failed: {0}")]
    TransactionFailed(String),
}

impl serde::Serialize for SwapError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

// ---------------------------------------------------------------------------
// 0x chain slug mapping
// ---------------------------------------------------------------------------

fn chain_to_zerox_slug(chain: &str) -> Option<&'static str> {
    match chain.trim() {
        "ETH" | "eth-mainnet" => Some("ethereum"),
        "BASE" | "base-mainnet" => Some("base"),
        "POL" | "polygon-mainnet" => Some("polygon"),
        "ETH-SEP" | "eth-sepolia" => Some("ethereum-sepolia"),
        "BASE-SEP" | "base-sepolia" => Some("base-sepolia"),
        _ => None,
    }
}

fn resolve_swap_rpc_url(chain: &str) -> Result<String, SwapError> {
    let api_key = crate::services::settings::get_alchemy_key_or_env()
        .ok_or(SwapError::MissingAlchemyKey)?;
    chain::chain_to_rpc_url(chain.trim(), &api_key)
        .ok_or_else(|| SwapError::UnsupportedChain(chain.to_string()))
}

// ---------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwapQuoteInput {
    pub from_token: String,
    pub to_token: String,
    /// Amount in wei (hex or decimal string)
    pub sell_amount_wei: String,
    pub chain: String,
    pub slippage_bps: Option<u32>,
    pub taker_address: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SwapQuoteResult {
    /// Router contract address to send tx to
    pub to: String,
    /// Hex-encoded calldata
    pub data: String,
    /// ETH value to send in wei (decimal string)
    pub value: String,
    /// Estimated gas
    pub gas_estimate: String,
    /// Buy amount in token's smallest unit
    pub buy_amount: String,
    /// Minimum buy amount after slippage
    pub min_buy_amount: String,
    /// Price impact estimate (may be "unknown")
    pub price_impact: String,
}

#[tauri::command]
pub async fn swap_get_quote(input: SwapQuoteInput) -> Result<SwapQuoteResult, SwapError> {
    let api_key = crate::services::settings::get_zerox_key_or_env()
        .ok_or(SwapError::MissingApiKey)?;

    let slug = chain_to_zerox_slug(&input.chain)
        .ok_or_else(|| SwapError::UnsupportedChain(input.chain.clone()))?;

    let slippage = input.slippage_bps.unwrap_or(50); // default 0.5%
    let slippage_pct = slippage as f64 / 10_000.0;

    let mut url = format!(
        "https://api.0x.org/swap/allowance-holder/quote?chainId={}&sellToken={}&buyToken={}&sellAmount={}&slippagePercentage={}",
        zerox_chain_id(slug),
        urlencoding::encode(&input.from_token),
        urlencoding::encode(&input.to_token),
        urlencoding::encode(&input.sell_amount_wei),
        slippage_pct,
    );

    if let Some(ref taker) = input.taker_address {
        if !taker.is_empty() {
            url.push_str(&format!("&taker={}", urlencoding::encode(taker)));
        }
    }

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| SwapError::QuoteFailed(e.to_string()))?;

    let resp = client
        .get(&url)
        .header("0x-api-key", &api_key)
        .header("0x-version", "v2")
        .send()
        .await
        .map_err(|e| SwapError::QuoteFailed(e.to_string()))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(SwapError::QuoteFailed(format!("{}: {}", status, body)));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| SwapError::QuoteFailed(e.to_string()))?;

    let tx = body.get("transaction").ok_or_else(|| {
        SwapError::QuoteFailed("Missing 'transaction' in 0x response".into())
    })?;

    let to = tx.get("to").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let data = tx.get("data").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let value = tx.get("value").and_then(|v| v.as_str()).unwrap_or("0").to_string();
    let gas = tx.get("gas").and_then(|v| v.as_str()).unwrap_or("0").to_string();

    let buy_amount = body
        .get("buyAmount")
        .and_then(|v| v.as_str())
        .unwrap_or("0")
        .to_string();

    let min_buy_amount = body
        .get("minBuyAmount")
        .and_then(|v| v.as_str())
        .unwrap_or("0")
        .to_string();

    let price_impact = body
        .get("estimatedPriceImpact")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    Ok(SwapQuoteResult {
        to,
        data,
        value,
        gas_estimate: gas,
        buy_amount,
        min_buy_amount,
        price_impact,
    })
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwapExecuteInput {
    pub from_address: String,
    pub from_token: String,
    pub to_token: String,
    pub sell_amount_wei: String,
    pub chain: String,
    pub slippage_bps: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SwapExecuteResult {
    pub tx_hash: String,
    pub buy_amount: String,
}

#[tauri::command]
pub async fn swap_execute(input: SwapExecuteInput) -> Result<SwapExecuteResult, SwapError> {
    let from = input.from_address.trim();
    if from.is_empty() || !from.starts_with("0x") || from.len() != 42 {
        return Err(SwapError::InvalidAddress);
    }

    // 1. Fetch quote
    let quote = swap_get_quote(SwapQuoteInput {
        from_token: input.from_token.clone(),
        to_token: input.to_token.clone(),
        sell_amount_wei: input.sell_amount_wei.clone(),
        chain: input.chain.clone(),
        slippage_bps: input.slippage_bps,
        taker_address: Some(from.to_string()),
    })
    .await?;

    // 2. Build & sign transaction
    let rpc_url = resolve_swap_rpc_url(&input.chain)?;

    let hex_pk = session::get_cached_key(from)
        .ok_or(SwapError::WalletLocked)?
        .as_str()
        .to_string();
    session::refresh_expiry(from);

    let wallet: LocalWallet = hex_pk
        .parse()
        .map_err(|_| SwapError::WalletNotFound)?;

    let provider = Provider::<Http>::try_from(&rpc_url)
        .map_err(|e| SwapError::TransactionFailed(e.to_string()))?;

    let chain_id = provider
        .get_chainid()
        .await
        .map_err(|e| SwapError::TransactionFailed(e.to_string()))?;

    let wallet = wallet.with_chain_id(chain_id.as_u64());
    let client = SignerMiddleware::new(provider, wallet);

    let to_addr = Address::from_str(&quote.to)
        .map_err(|_| SwapError::InvalidAddress)?;

    let value_u256 = if quote.value.starts_with("0x") || quote.value.starts_with("0X") {
        U256::from_str_radix(quote.value.trim_start_matches("0x").trim_start_matches("0X"), 16)
            .unwrap_or(U256::zero())
    } else {
        quote.value.parse::<U256>().unwrap_or(U256::zero())
    };

    let calldata: Bytes = hex::decode(
        quote.data.trim_start_matches("0x").trim_start_matches("0X"),
    )
    .map_err(|e| SwapError::TransactionFailed(format!("Bad calldata: {e}")))?
    .into();

    let tx = TransactionRequest::new()
        .to(to_addr)
        .value(value_u256)
        .data(calldata);

    let pending = client
        .send_transaction(tx, None)
        .await
        .map_err(|e| SwapError::TransactionFailed(e.to_string()))?;

    let receipt = pending
        .await
        .map_err(|e| SwapError::TransactionFailed(e.to_string()))?
        .ok_or_else(|| SwapError::TransactionFailed("Transaction dropped".into()))?;

    let tx_hash = format!("{:?}", receipt.transaction_hash);
    Ok(SwapExecuteResult {
        tx_hash,
        buy_amount: quote.buy_amount,
    })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn zerox_chain_id(slug: &str) -> u64 {
    match slug {
        "ethereum" => 1,
        "base" => 8453,
        "polygon" => 137,
        "ethereum-sepolia" => 11155111,
        "base-sepolia" => 84532,
        _ => 1,
    }
}
