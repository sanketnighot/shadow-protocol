//! Portfolio balance fetching via Alchemy. Shared by commands and agent tools.

use reqwest::Client;
use serde::{Deserialize, Serialize};

use super::chain::network_to_chain_display;

const MAINNET_NETWORKS: &[&str] = &["eth-mainnet", "base-mainnet", "polygon-mainnet"];
const TESTNET_NETWORKS: &[&str] = &["eth-sepolia", "base-sepolia", "polygon-amoy"];
const FLOW_MAINNET: &str = "flow-mainnet";
const FLOW_TESTNET: &str = "flow-testnet";

/// Build the list of networks to query, conditionally including Flow when installed.
fn active_networks() -> Vec<&'static str> {
    let mut nets: Vec<&str> = MAINNET_NETWORKS.iter().chain(TESTNET_NETWORKS.iter()).copied().collect();
    let flow_ready = super::apps::state::is_tool_app_ready("flow").unwrap_or(false);
    if flow_ready {
        nets.push(FLOW_MAINNET);
        nets.push(FLOW_TESTNET);
    }
    nets
}

#[derive(Debug, thiserror::Error)]
pub enum PortfolioError {
    #[error("Missing ALCHEMY_API_KEY")]
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
struct AlchemyTokenPrice {
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
    pub token_contract: String,
    pub decimals: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wallet_address: Option<String>,
}

pub(crate) fn raw_balance_to_amount(raw: &str, decimals: u8) -> f64 {
    let s = raw.trim().trim_start_matches("0x");
    if s.is_empty() {
        return 0.0;
    }
    let is_hex = raw.trim_start().starts_with("0x");
    let divisor = 10_f64.powi(decimals as i32);
    if is_hex {
        u128::from_str_radix(s, 16).unwrap_or(0) as f64 / divisor
    } else {
        s.parse::<f64>().unwrap_or(0.0) / divisor
    }
}

fn format_balance_display(value: f64) -> String {
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

pub async fn fetch_balances_multi(addresses: &[String]) -> Result<Vec<PortfolioAsset>, PortfolioError> {
    let mut all = Vec::new();
    for addr in addresses {
        let addr = addr.trim();
        if addr.is_empty() || !addr.starts_with("0x") || addr.len() != 42 {
            continue;
        }
        let mut assets = fetch_balances(addr).await?;
        all.append(&mut assets);
    }
    all.sort_by(|a, b| {
        let a_val: f64 = a.value_usd.trim_start_matches('$').parse().unwrap_or(0.0);
        let b_val: f64 = b.value_usd.trim_start_matches('$').parse().unwrap_or(0.0);
        b_val.partial_cmp(&a_val).unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(all)
}

pub async fn fetch_balances(address: &str) -> Result<Vec<PortfolioAsset>, PortfolioError> {
    let address = address.trim();
    if address.is_empty() || !address.starts_with("0x") || address.len() != 42 {
        return Err(PortfolioError::InvalidAddress);
    }

    let api_key = super::settings::get_alchemy_key_or_env().ok_or(PortfolioError::MissingApiKey)?;

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|_| PortfolioError::RequestFailed)?;

    let networks = active_networks();

    let url = format!(
        "https://api.g.alchemy.com/data/v1/{}/assets/tokens/by-address",
        api_key
    );

    let body = serde_json::json!({
        "addresses": [{"address": address, "networks": networks}],
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
                        "eth-mainnet" | "base-mainnet" | "eth-sepolia" | "base-sepolia" => {
                            "ETH".to_string()
                        }
                        "polygon-mainnet" | "matic-mainnet" | "polygon-amoy" | "matic-amoy" => {
                            "POL".to_string()
                        }
                        "flow-mainnet" | "flow-testnet" => {
                            "FLOW".to_string()
                        }
                        _ => "Unknown".to_string(),
                    }
                } else {
                    "Unknown".to_string()
                }
            });

        let unit_price: f64 = token
            .token_prices
            .as_ref()
            .and_then(|p| p.first())
            .and_then(|p| p.value.as_ref())
            .and_then(|v| v.parse().ok())
            .unwrap_or(0.0);

        let amount = raw_balance_to_amount(balance_str, decimals);
        let value_usd_f64 = amount * unit_price;
        let value_usd = format!("${:.2}", value_usd_f64);
        let balance_formatted = format_balance_display(amount);
        let balance_display = format!("{} {}", balance_formatted, symbol);

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

        let token_contract = if contract.is_empty() || contract.eq_ignore_ascii_case("null") {
            String::new()
        } else {
            contract.to_string()
        };

        assets.push(PortfolioAsset {
            id,
            symbol,
            chain: chain_code.to_string(),
            chain_name: chain_name.to_string(),
            balance: balance_display,
            value_usd,
            asset_type,
            token_contract,
            decimals,
            wallet_address: Some(address.to_string()),
        });
    }

    assets.sort_by(|a, b| {
        let a_val: f64 = a.value_usd.trim_start_matches('$').parse().unwrap_or(0.0);
        let b_val: f64 = b.value_usd.trim_start_matches('$').parse().unwrap_or(0.0);
        b_val.partial_cmp(&a_val).unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(assets)
}

#[cfg(test)]
mod tests {
    use super::raw_balance_to_amount;

    #[test]
    fn raw_balance_to_amount_parses_hex() {
        let amount = raw_balance_to_amount("0xde0b6b3a7640000", 18);
        assert!((amount - 1.0).abs() < 1e-10);
    }

    #[test]
    fn raw_balance_to_amount_handles_zero() {
        assert_eq!(raw_balance_to_amount("0", 18), 0.0);
        assert_eq!(raw_balance_to_amount("0x0", 18), 0.0);
    }
}

/// Fetch current USD price for a token via Alchemy Prices API.
pub async fn get_token_price_usd(token_symbol: &str) -> Result<f64, PortfolioError> {
    let api_key = super::settings::get_alchemy_key_or_env().ok_or(PortfolioError::MissingApiKey)?;

    let symbol = token_symbol.trim().to_uppercase();
    if symbol.is_empty() {
        return Err(PortfolioError::InvalidAddress);
    }

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|_| PortfolioError::RequestFailed)?;

    let url = format!(
        "https://api.g.alchemy.com/prices/v1/{}/tokens/by-symbol?symbols={}",
        api_key, symbol
    );

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|_| PortfolioError::RequestFailed)?;

    if !resp.status().is_success() {
        return Err(PortfolioError::RequestFailed);
    }

    let body: serde_json::Value = resp.json().await.map_err(|_| PortfolioError::RequestFailed)?;
    let value = body
        .get("data")
        .and_then(|d| d.get(symbol))
        .and_then(|t| t.get("value"))
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);

    Ok(value)
}
