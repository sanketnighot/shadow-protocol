//! Portfolio balance fetching via Alchemy. Shared by commands and agent tools.
//! Cadence Flow balances are merged via the apps-runtime sidecar (`apps::flow`).

use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::chain::{chain_code_to_display, network_to_chain_display};
use super::flow_domain::{cadence_account_key, is_cadence_flow_address, is_flow_evm_style_address};

const MAINNET_NETWORKS: &[&str] = &["eth-mainnet", "base-mainnet", "polygon-mainnet"];
const TESTNET_NETWORKS: &[&str] = &["eth-sepolia", "base-sepolia", "polygon-amoy"];
const FLOW_MAINNET: &str = "flow-mainnet";
const FLOW_TESTNET: &str = "flow-testnet";

/// Alchemy `data/v1/.../tokens/by-address` documents a **maximum of 5 networks per address**.
const MAX_NETWORKS_PER_PORTFOLIO_REQUEST: usize = 5;

fn core_evm_portfolio_networks() -> Vec<&'static str> {
    MAINNET_NETWORKS.iter().chain(TESTNET_NETWORKS.iter()).copied().collect()
}

/// Flow EVM slugs for Portfolio API (best-effort; not gated on the Flow app so `0x` wallets see balances).
fn flow_portfolio_networks() -> Vec<&'static str> {
    vec![FLOW_MAINNET, FLOW_TESTNET]
}

/// Native FLOW on Flow EVM uses 18 decimals (standard EVM); Cadence FLOW uses 8.
const FLOW_EVM_NATIVE_DECIMALS: u8 = 18;

async fn post_alchemy_portfolio_tokens(
    client: &Client,
    api_key: &str,
    address: &str,
    networks: &[&str],
) -> Result<Vec<AlchemyToken>, PortfolioError> {
    if networks.is_empty() {
        return Ok(Vec::new());
    }

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

    Ok(body
        .data
        .and_then(|d| d.tokens)
        .unwrap_or_default())
}

/// Best-effort `eth_getBalance` on Alchemy Flow EVM RPC (works when Portfolio omits Flow).
async fn alchemy_flow_evm_native_balance_hex(
    client: &Client,
    api_key: &str,
    network: &str,
    address: &str,
) -> Option<String> {
    let url = format!("https://{}.g.alchemy.com/v2/{}", network, api_key);
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1_u8,
        "method": "eth_getBalance",
        "params": [address, "latest"],
    });
    let resp = client.post(&url).json(&body).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let v: serde_json::Value = resp.json().await.ok()?;
    if v.get("error").is_some() {
        return None;
    }
    v.get("result")
        .and_then(|r| r.as_str())
        .map(std::string::ToString::to_string)
}

fn has_flow_evm_native_flow_asset(assets: &[PortfolioAsset], chain_code: &str) -> bool {
    assets.iter().any(|a| {
        a.chain == chain_code
            && a.symbol == "FLOW"
            && a.token_contract.trim().is_empty()
    })
}

async fn merge_flow_evm_native_via_alchemy_rpc(
    assets: &mut Vec<PortfolioAsset>,
    address: &str,
    client: &Client,
    api_key: &str,
) {
    let price = get_token_price_usd("FLOW").await.unwrap_or(0.0);

    let pairs = [
        (FLOW_MAINNET, "FLOW-EVM", "Flow EVM"),
        (FLOW_TESTNET, "FLOW-EVM-TEST", "Flow EVM Testnet"),
    ];

    for (network, chain_code, chain_name) in pairs {
        if has_flow_evm_native_flow_asset(assets, chain_code) {
            continue;
        }
        let Some(hex_bal) = alchemy_flow_evm_native_balance_hex(client, api_key, network, address).await
        else {
            continue;
        };
        let s = hex_bal.trim();
        let raw = s.strip_prefix("0x").unwrap_or(s);
        if raw.is_empty() || raw.chars().all(|c| c == '0') {
            continue;
        }
        let amount = raw_balance_to_amount(&hex_bal, FLOW_EVM_NATIVE_DECIMALS);
        if amount <= 0.0 {
            continue;
        }
        let value_usd_f64 = amount * price;
        let value_usd = format!("${:.2}", value_usd_f64);
        let balance_formatted = format_balance_display(amount);
        let balance_display = format!("{balance_formatted} FLOW");

        assets.push(PortfolioAsset {
            id: format!("asset-{chain_code}-flow-native"),
            symbol: "FLOW".to_string(),
            chain: chain_code.to_string(),
            chain_name: chain_name.to_string(),
            balance: balance_display,
            value_usd,
            asset_type: "native".to_string(),
            token_contract: String::new(),
            decimals: FLOW_EVM_NATIVE_DECIMALS,
            wallet_address: Some(address.to_string()),
            unified_balance_note: None,
            flow_cross_vm_bridge_eligible: None,
        });
    }
}

#[derive(Debug, thiserror::Error)]
pub enum PortfolioError {
    #[error("Missing ALCHEMY_API_KEY")]
    MissingApiKey,
    #[error("Invalid address")]
    InvalidAddress,
    #[error("API request failed")]
    RequestFailed,
    #[error("{0}")]
    FetchFailed(String),
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
    /// When the same symbol appears on Cadence and Flow EVM, surface bridge context.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unified_balance_note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flow_cross_vm_bridge_eligible: Option<bool>,
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
        if addr.is_empty() || !is_flow_evm_style_address(addr) {
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

/// Parse sidecar JSON: `{ "assets": [...] }` or legacy `{ "data": { "assets": [...] } }`.
pub fn assets_from_flow_sidecar_response(flow_data: serde_json::Value, address: &str) -> Vec<PortfolioAsset> {
    let mut assets = Vec::new();

    let assets_arr = flow_data
        .get("assets")
        .and_then(|a| a.as_array())
        .or_else(|| {
            flow_data
                .get("data")
                .and_then(|d| d.get("assets"))
                .and_then(|a| a.as_array())
        });

    let Some(assets_arr) = assets_arr else {
        return assets;
    };

    for asset in assets_arr {
        let symbol = asset
            .get("symbol")
            .and_then(|s| s.as_str())
            .unwrap_or("FLOW")
            .to_string();
        let balance = asset
            .get("balance")
            .and_then(|b| b.as_str())
            .unwrap_or("0")
            .to_string();
        let network = asset
            .get("chain")
            .and_then(|c| c.as_str())
            .unwrap_or("flow-testnet")
            .to_string();

        let (chain_name, chain_code) = match network.as_str() {
            "flow-mainnet" => (chain_code_to_display("FLOW"), "FLOW"),
            "flow-testnet" => (chain_code_to_display("FLOW-TEST"), "FLOW-TEST"),
            _ => network_to_chain_display(&network),
        };

        let decimals = asset.get("decimals").and_then(|d| d.as_i64()).unwrap_or(8) as u8;

        assets.push(PortfolioAsset {
            id: format!(
                "{}-{}-{}",
                address,
                chain_code.to_lowercase(),
                symbol.to_lowercase()
            ),
            symbol,
            chain: chain_code.to_string(),
            chain_name: chain_name.to_string(),
            balance,
            value_usd: "$0.00".to_string(),
            asset_type: "native".to_string(),
            token_contract: String::new(),
            decimals,
            wallet_address: Some(address.to_string()),
            unified_balance_note: None,
            flow_cross_vm_bridge_eligible: None,
        });
    }

    assets
}

/// EVM (`0x` 20-byte) addresses use Alchemy; Cadence Flow addresses use the Flow sidecar.
async fn hydrate_cadence_flow_usd(assets: &mut [PortfolioAsset]) {
    let Ok(px) = get_token_price_usd("FLOW").await else {
        return;
    };
    for a in assets.iter_mut() {
        if (a.chain == "FLOW" || a.chain == "FLOW-TEST") && a.symbol == "FLOW" {
            let amt: f64 = a.balance.trim().parse().unwrap_or(0.0);
            let usd = amt * px;
            a.value_usd = format!("${usd:.2}");
        }
    }
}

fn flow_ecosystem_chain(chain: &str) -> bool {
    matches!(
        chain,
        "FLOW" | "FLOW-TEST" | "FLOW-EVM" | "FLOW-EVM-TEST"
    )
}

fn annotate_flow_cross_vm(assets: &mut [PortfolioAsset]) {
    use std::collections::HashMap;

    let mut by_symbol: HashMap<String, Vec<usize>> = HashMap::new();
    for (i, a) in assets.iter().enumerate() {
        if flow_ecosystem_chain(&a.chain) {
            by_symbol
                .entry(a.symbol.to_uppercase())
                .or_default()
                .push(i);
        }
    }

    for idxs in by_symbol.values() {
        if idxs.len() < 2 {
            continue;
        }
        let mut cadence = false;
        let mut evm = false;
        for &i in idxs {
            match assets[i].chain.as_str() {
                "FLOW" | "FLOW-TEST" => cadence = true,
                "FLOW-EVM" | "FLOW-EVM-TEST" => evm = true,
                _ => {}
            }
        }
        if !(cadence && evm) {
            continue;
        }
        let note = Some(
            "Cross-VM bridge eligible: same symbol on Cadence Flow and Flow EVM — unified view is approximate."
                .to_string(),
        );
        for &i in idxs {
            assets[i].unified_balance_note = note.clone();
            assets[i].flow_cross_vm_bridge_eligible = Some(true);
        }
    }
}

/// When portfolio rows come only from SQLite (EVM wallets), we never call [`fetch_balances_mixed`],
/// so the user's configured Cadence account would be missing. Append it here if absent.
pub async fn append_configured_cadence_assets_if_absent(
    app: &AppHandle,
    assets: &mut Vec<PortfolioAsset>,
) -> Result<(), PortfolioError> {
    if !super::apps::state::is_tool_app_ready("flow").unwrap_or(false) {
        return Ok(());
    }
    let Some(cad_key) = super::apps::flow::configured_cadence_address() else {
        return Ok(());
    };
    let has_cadence_row = assets.iter().any(|a| {
        cadence_account_key(a.wallet_address.as_deref().unwrap_or(""))
            .map(|k| k == cad_key)
            .unwrap_or(false)
    });
    if has_cadence_row {
        return Ok(());
    }
    let flow_json = super::apps::flow::fetch_balances(app, &cad_key)
        .await
        .map_err(|e| PortfolioError::FetchFailed(format!("Flow fetch failed: {e}")))?;
    let parsed = assets_from_flow_sidecar_response(flow_json, &cad_key);
    if !parsed.is_empty() {
        assets.extend(parsed);
    }
    hydrate_cadence_flow_usd(assets).await;
    annotate_flow_cross_vm(assets);
    Ok(())
}

pub async fn fetch_balances_mixed(
    app: &AppHandle,
    addresses: &[String],
) -> Result<Vec<PortfolioAsset>, PortfolioError> {
    let mut all = Vec::new();
    let mut evm_addrs: Vec<String> = Vec::new();

    for addr in addresses {
        let a = addr.trim();
        if a.is_empty() {
            continue;
        }
        if is_cadence_flow_address(a) {
            let flow_json = super::apps::flow::fetch_balances(app, a)
                .await
                .map_err(|e| PortfolioError::FetchFailed(format!("Flow fetch failed: {e}")))?;
            let parsed = assets_from_flow_sidecar_response(flow_json, a);
            if parsed.is_empty() {
                // Successful empty account is valid; do not fall through to Alchemy.
                continue;
            }
            all.extend(parsed);
        } else if is_flow_evm_style_address(a) {
            evm_addrs.push(a.to_string());
        }
    }

    if !evm_addrs.is_empty() {
        let evm_assets = fetch_balances_multi(&evm_addrs).await?;
        all.extend(evm_assets);
    }

    if super::apps::state::is_tool_app_ready("flow").unwrap_or(false) {
        if let Some(ref cad_key) = super::apps::flow::configured_cadence_address() {
            let already = addresses.iter().filter_map(|a| cadence_account_key(a.trim())).any(|k| &k == cad_key);
            if !already {
                let flow_json = super::apps::flow::fetch_balances(app, cad_key)
                    .await
                    .map_err(|e| PortfolioError::FetchFailed(format!("Flow fetch failed: {e}")))?;
                let parsed = assets_from_flow_sidecar_response(flow_json, cad_key);
                if !parsed.is_empty() {
                    all.extend(parsed);
                }
            }
        }
    }

    hydrate_cadence_flow_usd(&mut all).await;
    annotate_flow_cross_vm(&mut all);

    all.sort_by(|a, b| {
        let a_val: f64 = a.value_usd.trim_start_matches('$').parse().unwrap_or(0.0);
        let b_val: f64 = b.value_usd.trim_start_matches('$').parse().unwrap_or(0.0);
        b_val.partial_cmp(&a_val).unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(all)
}

pub async fn fetch_balances(address: &str) -> Result<Vec<PortfolioAsset>, PortfolioError> {
    let address = address.trim();
    if address.is_empty() || !is_flow_evm_style_address(address) {
        return Err(PortfolioError::InvalidAddress);
    }

    let api_key = super::settings::get_alchemy_key_or_env().ok_or(PortfolioError::MissingApiKey)?;

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|_| PortfolioError::RequestFailed)?;

    let mut tokens: Vec<AlchemyToken> = Vec::new();

    let core = core_evm_portfolio_networks();
    for chunk in core.chunks(MAX_NETWORKS_PER_PORTFOLIO_REQUEST) {
        let chunk_tokens = post_alchemy_portfolio_tokens(&client, &api_key, address, chunk).await?;
        tokens.extend(chunk_tokens);
    }

    let flow_nets = flow_portfolio_networks();
    if let Ok(flow_tokens) = post_alchemy_portfolio_tokens(&client, &api_key, address, &flow_nets).await
    {
        tokens.extend(flow_tokens);
    }

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

        let network_raw = token.network.as_deref().unwrap_or("");
        let (chain_name, chain_code) = network_to_chain_display(network_raw);
        let metadata = token.token_metadata.unwrap_or_default();
        let decimals = metadata.decimals.unwrap_or(18);
        let symbol = metadata
            .symbol
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.to_uppercase())
            .unwrap_or_else(|| {
                let token_addr = token.token_address.as_deref().unwrap_or("");
                if token_addr.is_empty() || token_addr.eq_ignore_ascii_case("null") {
                    match network_raw
                        .trim()
                        .to_lowercase()
                        .replace('_', "-")
                        .replace(' ', "")
                        .as_str()
                    {
                        "eth-mainnet" | "base-mainnet" | "eth-sepolia" | "base-sepolia" => {
                            "ETH".to_string()
                        }
                        "polygon-mainnet" | "matic-mainnet" | "polygon-amoy" | "matic-amoy" => {
                            "POL".to_string()
                        }
                        "flow-mainnet"
                        | "flow-evm-mainnet"
                        | "flowevm-mainnet"
                        | "flow-testnet"
                        | "flow-evm-testnet"
                        | "flowevm-testnet" => "FLOW".to_string(),
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
            unified_balance_note: None,
            flow_cross_vm_bridge_eligible: None,
        });
    }

    merge_flow_evm_native_via_alchemy_rpc(&mut assets, address, &client, &api_key).await;

    assets.sort_by(|a, b| {
        let a_val: f64 = a.value_usd.trim_start_matches('$').parse().unwrap_or(0.0);
        let b_val: f64 = b.value_usd.trim_start_matches('$').parse().unwrap_or(0.0);
        b_val.partial_cmp(&a_val).unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(assets)
}

#[cfg(test)]
mod tests {
    use super::{assets_from_flow_sidecar_response, raw_balance_to_amount};

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

    #[test]
    fn flow_sidecar_assets_top_level_shape() {
        let v = serde_json::json!({
            "assets": [{"symbol":"FLOW","balance":"2.5","chain":"flow-testnet","decimals":8}]
        });
        let out = assets_from_flow_sidecar_response(v, "0x1111111111111111");
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].chain, "FLOW-TEST");
        assert_eq!(out[0].symbol, "FLOW");
    }

    #[test]
    fn flow_sidecar_assets_nested_data_shape() {
        let v = serde_json::json!({
            "data": { "assets": [{"symbol":"FLOW","balance":"1","chain":"flow-mainnet","decimals":8}] }
        });
        let out = assets_from_flow_sidecar_response(v, "abcd1234abcd1234");
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].chain, "FLOW");
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
