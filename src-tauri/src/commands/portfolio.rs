//! Portfolio balance fetching via Alchemy API. Requires ALCHEMY_API_KEY env var.

use reqwest::Client;
use serde::{Deserialize, Serialize};

const MAINNET_NETWORKS: &[&str] = &["eth-mainnet", "arb-mainnet", "base-mainnet"];
const TESTNET_NETWORKS: &[&str] = &["eth-sepolia", "base-sepolia", "polygon-amoy"];

fn network_to_chain_display(network: &str) -> (&str, &str) {
    match network {
        "eth-mainnet" => ("Ethereum", "ETH"),
        "arb-mainnet" => ("Arbitrum", "ARB"),
        "base-mainnet" => ("Base", "BASE"),
        "eth-sepolia" => ("Ethereum Sepolia", "ETH-SEP"),
        "base-sepolia" => ("Base Sepolia", "BASE-SEP"),
        "polygon-amoy" => ("Polygon Amoy", "MATIC-AMOY"),
        _ => (network, network),
    }
}

#[derive(Debug, thiserror::Error)]
pub enum PortfolioError {
    #[error("Missing ALCHEMY_API_KEY — add it to .env or your environment to fetch real balances")]
    MissingApiKey,
    #[error("Invalid address")]
    InvalidAddress,
    #[error("API request failed")]
    RequestFailed,
}

impl serde::Serialize for PortfolioError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Deserialize)]
struct AlchemyResponse {
    data: Option<AlchemyData>,
    error: Option<AlchemyError>,
}

#[derive(Debug, Deserialize)]
struct AlchemyData {
    tokens: Option<Vec<AlchemyToken>>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct AlchemyError {
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AlchemyToken {
    network: Option<String>,
    token_address: Option<String>,
    token_balance: Option<String>,
    token_metadata: Option<AlchemyTokenMetadata>,
    token_prices: Option<Vec<AlchemyTokenPrice>>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AlchemyTokenMetadata {
    decimals: Option<u8>,
    symbol: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct AlchemyTokenPrice {
    currency: Option<String>,
    value: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioAsset {
    pub id: String,
    pub symbol: String,
    pub chain: String,
    pub chain_name: String,
    pub balance: String,
    pub value_usd: String,
    #[serde(rename = "type")]
    pub asset_type: String,
}

fn parse_raw_balance(raw: &str) -> String {
    let s = raw.trim().trim_start_matches("0x");
    if s.is_empty() {
        return "0".to_string();
    }
    s.to_string()
}

fn format_balance_display(raw: &str, decimals: u8) -> String {
    let balance_str = parse_raw_balance(raw);
    if balance_str == "0" {
        return "0".to_string();
    }
    let trimmed = raw.trim_start();
    let is_hex = trimmed.starts_with("0x");
    let divisor = 10_f64.powi(decimals as i32);
    let value = if is_hex {
        u128::from_str_radix(&balance_str, 16).unwrap_or(0) as f64 / divisor
    } else {
        balance_str.parse::<f64>().unwrap_or(0.0) / divisor
    };
    if value >= 1_000_000.0 || value >= 1_000.0 {
        format!("{:.2}", value)
    } else if value >= 1.0 {
        format!("{:.4}", value)
    } else if value >= 0.0001 {
        format!("{:.6}", value)
    } else {
        format!("{:.8}", value)
    }
}

#[tauri::command]
pub async fn portfolio_fetch_balances(
    address: String,
    developer_mode: Option<bool>,
) -> Result<Vec<PortfolioAsset>, PortfolioError> {
    let address = address.trim();
    if address.is_empty() || !address.starts_with("0x") || address.len() != 42 {
        return Err(PortfolioError::InvalidAddress);
    }

    let _ = dotenvy::dotenv();

    let api_key = std::env::var("ALCHEMY_API_KEY").map_err(|_| PortfolioError::MissingApiKey)?;

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|_| PortfolioError::RequestFailed)?;

    let networks: Vec<&str> = if developer_mode.unwrap_or(false) {
        MAINNET_NETWORKS
            .iter()
            .chain(TESTNET_NETWORKS.iter())
            .copied()
            .collect()
    } else {
        MAINNET_NETWORKS.to_vec()
    };

    let url = format!(
        "https://api.g.alchemy.com/data/v1/{}/assets/tokens/by-address",
        api_key
    );

    let body = serde_json::json!({
        "addresses": [{
            "address": address,
            "networks": networks
        }],
        "withMetadata": true,
        "withPrices": true,
        "includeNativeTokens": true,
        "includeErc20Tokens": true
    });

    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|_| PortfolioError::RequestFailed)?;

    if !resp.status().is_success() {
        return Err(PortfolioError::RequestFailed);
    }

    let body: AlchemyResponse = resp.json().await.map_err(|_| PortfolioError::RequestFailed)?;

    if body.error.is_some() {
        return Err(PortfolioError::RequestFailed);
    }

    let tokens = body
        .data
        .and_then(|d| d.tokens)
        .unwrap_or_default();

    let mut assets = Vec::new();

    for token in tokens {
        let balance_str = token.token_balance.as_deref().unwrap_or("0");
        let is_native = {
            let addr = token.token_address.as_deref().unwrap_or("");
            addr.is_empty() || addr.eq_ignore_ascii_case("null")
        };
        if !is_native && (balance_str == "0" || balance_str.is_empty()) {
            continue;
        }

        let network = token.network.as_deref().unwrap_or("");
        let (chain_name, chain_code) = network_to_chain_display(network);
        let metadata = token.token_metadata.unwrap_or_default();
        let decimals = metadata.decimals.unwrap_or(18);
        let symbol = metadata
            .symbol
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.to_uppercase())
            .unwrap_or_else(|| {
                let token_addr = token.token_address.as_deref().unwrap_or("");
                if token_addr.is_empty() || token_addr.eq_ignore_ascii_case("null") {
                    match network {
                        "eth-mainnet" | "arb-mainnet" | "base-mainnet"
                        | "eth-sepolia" | "base-sepolia" => "ETH".to_string(),
                        "polygon-amoy" => "POL".to_string(),
                        _ => "Unknown".to_string(),
                    }
                } else {
                    "Unknown".to_string()
                }
            });

        let quote = token
            .token_prices
            .as_ref()
            .and_then(|p| p.first())
            .and_then(|p| p.value.as_ref())
            .and_then(|v| v.parse::<f64>().ok())
            .unwrap_or(0.0);

        let balance_formatted = format_balance_display(balance_str, decimals);
        let value_usd = format!("${:.2}", quote);
        let contract = token.token_address.as_deref().unwrap_or("");
        let asset_type = matches!(
            symbol.as_str(),
            "USDC" | "USDT" | "DAI" | "BUSD" | "FRAX" | "TUSD"
        )
        .then(|| "stablecoin")
        .unwrap_or("token")
        .to_string();

        let id = format!(
            "asset-{}-{}-{}",
            chain_code,
            symbol.to_lowercase(),
            &contract[..contract.len().min(10)]
        );

        let balance_display = format!("{} {}", balance_formatted, symbol);

        assets.push(PortfolioAsset {
            id,
            symbol,
            chain: chain_code.to_string(),
            chain_name: chain_name.to_string(),
            balance: balance_display,
            value_usd,
            asset_type,
        });
    }

    assets.sort_by(|a, b| {
        let a_val: f64 = a.value_usd.trim_start_matches('$').parse().unwrap_or(0.0);
        let b_val: f64 = b.value_usd.trim_start_matches('$').parse().unwrap_or(0.0);
        b_val.partial_cmp(&a_val).unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(assets)
}
