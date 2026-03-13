//! Portfolio and price tools (READ — auto-execute).

use std::collections::HashMap;

use serde::Serialize;

use crate::services::portfolio_service;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletBalanceItem {
    pub chain: String,
    pub token: String,
    pub amount: String,
    pub value_usd: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wallet_address: Option<String>,
}

pub async fn get_wallet_balances(address: &str) -> Result<Vec<WalletBalanceItem>, String> {
    let assets = portfolio_service::fetch_balances(address)
        .await
        .map_err(|e| e.to_string())?;

    Ok(assets
        .into_iter()
        .map(|a| WalletBalanceItem {
            chain: a.chain,
            token: a.symbol,
            amount: a.balance,
            value_usd: a.value_usd,
            wallet_address: a.wallet_address,
        })
        .collect())
}

pub async fn get_wallet_balances_multi(
    addresses: &[&str],
) -> Result<Vec<WalletBalanceItem>, String> {
    let addrs: Vec<String> = addresses
        .iter()
        .map(|s| (*s).to_string())
        .collect();
    let assets = portfolio_service::fetch_balances_multi(&addrs)
        .await
        .map_err(|e| e.to_string())?;

    Ok(assets
        .into_iter()
        .map(|a| WalletBalanceItem {
            chain: a.chain,
            token: a.symbol,
            amount: a.balance,
            value_usd: a.value_usd,
            wallet_address: a.wallet_address,
        })
        .collect())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TotalPortfolioValue {
    pub total_usd: String,
    pub breakdown: Vec<TokenValueItem>,
    pub wallet_count: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenValueItem {
    pub token: String,
    pub value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chains: Option<String>,
}

pub async fn get_total_portfolio_value(address: &str) -> Result<TotalPortfolioValue, String> {
    let assets = portfolio_service::fetch_balances(address)
        .await
        .map_err(|e| e.to_string())?;
    aggregate_to_total_portfolio_value(&assets, 1)
}

pub async fn get_total_portfolio_value_multi(
    addresses: &[&str],
) -> Result<TotalPortfolioValue, String> {
    let addrs: Vec<String> = addresses.iter().map(|s| (*s).to_string()).collect();
    let assets = portfolio_service::fetch_balances_multi(&addrs)
        .await
        .map_err(|e| e.to_string())?;
    aggregate_to_total_portfolio_value(&assets, addresses.len() as u32)
}

fn aggregate_to_total_portfolio_value(
    assets: &[portfolio_service::PortfolioAsset],
    wallet_count: u32,
) -> Result<TotalPortfolioValue, String> {
    let mut by_token: HashMap<String, (f64, Vec<String>)> = HashMap::new();
    for a in assets {
        let v: f64 = a.value_usd.trim_start_matches('$').parse().unwrap_or(0.0);
        let entry = by_token.entry(a.symbol.clone()).or_insert((0.0, Vec::new()));
        entry.0 += v;
        if !entry.1.contains(&a.chain) {
            entry.1.push(a.chain.clone());
        }
    }
    let mut total: f64 = 0.0;
    let breakdown: Vec<TokenValueItem> = by_token
        .into_iter()
        .map(|(token, (sum, chains))| {
            total += sum;
            let chains_str = if chains.is_empty() {
                None
            } else {
                Some(chains.join(", "))
            };
            TokenValueItem {
                token,
                value: format!("${:.2}", sum),
                chains: chains_str,
            }
        })
        .collect();

    Ok(TotalPortfolioValue {
        total_usd: format!("${:.2}", total),
        breakdown,
        wallet_count,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenPriceResult {
    pub price_usd: f64,
    pub source: String,
}

pub async fn get_token_price(token_symbol: &str) -> Result<TokenPriceResult, String> {
    let price = portfolio_service::get_token_price_usd(token_symbol)
        .await
        .map_err(|e| e.to_string())?;

    Ok(TokenPriceResult {
        price_usd: price,
        source: "Alchemy".to_string(),
    })
}
