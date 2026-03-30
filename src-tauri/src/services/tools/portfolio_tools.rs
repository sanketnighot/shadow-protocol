//! Portfolio and price tools (READ — auto-execute).

use std::collections::HashMap;

use serde::Serialize;
use tauri::AppHandle;

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

pub async fn get_wallet_balances(app: &AppHandle, address: &str) -> Result<Vec<WalletBalanceItem>, String> {
    let assets = portfolio_service::fetch_balances_mixed(app, &[address.to_string()])
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
    app: &AppHandle,
    addresses: &[&str],
) -> Result<Vec<WalletBalanceItem>, String> {
    let addrs: Vec<String> = addresses.iter().map(|s| (*s).to_string()).collect();
    let assets = portfolio_service::fetch_balances_mixed(app, &addrs)
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
pub struct HoldingDetail {
    /// Shortened wallet address (e.g. 0x1234…5678)
    pub wallet: String,
    pub chain: String,
    /// Token amount (e.g. "0.05")
    pub amount: String,
    pub value: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenValueItem {
    pub token: String,
    /// Total token amount across all wallets/chains (e.g. "0.15")
    pub amount: String,
    pub value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chains: Option<String>,
    /// Per-wallet, per-chain breakdown
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub holdings: Vec<HoldingDetail>,
}

fn shorten_wallet(addr: &str) -> String {
    if addr.len() <= 12 {
        return addr.to_string();
    }
    format!("{}…{}", &addr[..6], &addr[addr.len() - 4..])
}

fn parse_amount_from_balance(balance: &str, symbol: &str) -> f64 {
    let s = balance
        .trim()
        .strip_suffix(symbol)
        .unwrap_or(balance)
        .trim();
    s.replace(',', "").parse().unwrap_or(0.0)
}

pub async fn get_total_portfolio_value(app: &AppHandle, address: &str) -> Result<TotalPortfolioValue, String> {
    let assets = portfolio_service::fetch_balances_mixed(app, &[address.to_string()])
        .await
        .map_err(|e| e.to_string())?;
    aggregate_to_total_portfolio_value(&assets, 1)
}

pub async fn get_total_portfolio_value_multi(
    app: &AppHandle,
    addresses: &[&str],
) -> Result<TotalPortfolioValue, String> {
    let addrs: Vec<String> = addresses.iter().map(|s| (*s).to_string()).collect();
    let assets = portfolio_service::fetch_balances_mixed(app, &addrs)
        .await
        .map_err(|e| e.to_string())?;
    aggregate_to_total_portfolio_value(&assets, addresses.len() as u32)
}

#[derive(Default)]
struct TokenAgg {
    value_sum: f64,
    amount_sum: f64,
    chains: Vec<String>,
    holdings: Vec<HoldingDetail>,
}

fn aggregate_to_total_portfolio_value(
    assets: &[portfolio_service::PortfolioAsset],
    wallet_count: u32,
) -> Result<TotalPortfolioValue, String> {
    let mut by_token: HashMap<String, TokenAgg> = HashMap::new();
    for a in assets {
        let v: f64 = a.value_usd.trim_start_matches('$').parse().unwrap_or(0.0);
        let amt = parse_amount_from_balance(&a.balance, &a.symbol);
        let entry = by_token.entry(a.symbol.clone()).or_default();
        entry.value_sum += v;
        entry.amount_sum += amt;
        if !entry.chains.contains(&a.chain) {
            entry.chains.push(a.chain.clone());
        }
        let wallet_short = a
            .wallet_address
            .as_deref()
            .map(shorten_wallet)
            .unwrap_or_else(|| "?".to_string());
        let amt_str = format_balance_for_aggregate(amt);
        entry.holdings.push(HoldingDetail {
            wallet: wallet_short,
            chain: a.chain.clone(),
            amount: amt_str,
            value: a.value_usd.clone(),
        });
    }
    let mut total: f64 = 0.0;
    let breakdown: Vec<TokenValueItem> = by_token
        .into_iter()
        .map(|(token, agg)| {
            total += agg.value_sum;
            let chains_str = if agg.chains.is_empty() {
                None
            } else {
                Some(agg.chains.join(", "))
            };
            let amount_str = format_balance_for_aggregate(agg.amount_sum);
            TokenValueItem {
                token,
                amount: amount_str,
                value: format!("${:.2}", agg.value_sum),
                chains: chains_str,
                holdings: agg.holdings,
            }
        })
        .collect();

    Ok(TotalPortfolioValue {
        total_usd: format!("${:.2}", total),
        breakdown,
        wallet_count,
    })
}

fn format_balance_for_aggregate(value: f64) -> String {
    if value >= 1_000_000.0 || value >= 1_000.0 {
        format!("{:.2}", value)
    } else if value >= 1.0 {
        format!("{:.4}", value)
    } else if value >= 0.0001 {
        format!("{:.6}", value)
    } else if value > 0.0 {
        format!("{:.8}", value)
    } else {
        "0".to_string()
    }
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
