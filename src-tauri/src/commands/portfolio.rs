//! Portfolio balance fetching: local DB first, Alchemy fallback.

use serde::Serialize;

use crate::services::chain::{chain_code_to_display, chain_to_explorer_base};
use crate::services::local_db;
use crate::services::portfolio_service::{self, PortfolioAsset, PortfolioError};

fn token_rows_to_assets(rows: Vec<local_db::TokenRow>) -> Vec<PortfolioAsset> {
    rows.into_iter()
        .map(|r| {
            let chain_name = chain_code_to_display(&r.chain).to_string();
            let asset_type = if r.asset_type == "stablecoin" {
                "stablecoin"
            } else {
                "token"
            };
            PortfolioAsset {
                id: r.id,
                symbol: r.symbol,
                chain: r.chain,
                chain_name,
                balance: r.balance,
                value_usd: r.value_usd,
                asset_type: asset_type.to_string(),
                token_contract: r.token_contract,
                decimals: r.decimals,
                wallet_address: Some(r.wallet_address),
            }
        })
        .collect()
}

#[tauri::command]
pub async fn portfolio_fetch_balances(address: String) -> Result<Vec<PortfolioAsset>, PortfolioError> {
    if let Ok(rows) = local_db::get_tokens_for_wallets(&[address.clone()]) {
        if !rows.is_empty() {
            return Ok(token_rows_to_assets(rows));
        }
    }
    portfolio_service::fetch_balances(&address).await
}

#[tauri::command]
pub async fn portfolio_fetch_balances_multi(
    addresses: Vec<String>,
) -> Result<Vec<PortfolioAsset>, PortfolioError> {
    if addresses.is_empty() {
        return Ok(Vec::new());
    }
    if let Ok(rows) = local_db::get_tokens_for_wallets(&addresses) {
        if !rows.is_empty() {
            return Ok(token_rows_to_assets(rows));
        }
    }
    portfolio_service::fetch_balances_multi(&addresses).await
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionDisplay {
    pub id: String,
    pub tx_hash: String,
    pub chain: String,
    pub chain_name: String,
    pub category: Option<String>,
    pub value: Option<String>,
    pub from_addr: Option<String>,
    pub to_addr: Option<String>,
    pub timestamp: Option<i64>,
    pub block_explorer_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NftDisplay {
    pub id: String,
    pub contract: String,
    pub token_id: String,
    pub chain: String,
    pub chain_name: String,
    pub name: Option<String>,
    pub image_url: Option<String>,
}

#[tauri::command]
pub async fn portfolio_fetch_transactions(
    addresses: Vec<String>,
    limit: Option<u32>,
) -> Result<Vec<TransactionDisplay>, String> {
    if addresses.is_empty() {
        return Ok(Vec::new());
    }
    let limit_i64 = limit.map(i64::from).unwrap_or(100);
    let rows = local_db::get_transactions_for_wallets(&addresses, Some(limit_i64))
        .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|r| {
            let chain_code = r.chain.as_str();
            let chain_name = chain_code_to_display(chain_code).to_string();
            let base = chain_to_explorer_base(chain_code);
            let tx_hash = r.tx_hash.clone();
            TransactionDisplay {
                id: r.id,
                tx_hash: tx_hash.clone(),
                chain: chain_code.to_string(),
                chain_name,
                category: r.category,
                value: r.value,
                from_addr: r.from_addr,
                to_addr: r.to_addr,
                timestamp: r.timestamp,
                block_explorer_url: format!("{}/tx/{}", base, tx_hash),
            }
        })
        .collect())
}

#[tauri::command]
pub async fn portfolio_fetch_nfts(addresses: Vec<String>) -> Result<Vec<NftDisplay>, String> {
    if addresses.is_empty() {
        return Ok(Vec::new());
    }
    let rows = local_db::get_nfts_for_wallets(&addresses).map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|r| {
            let chain_code = r.chain.as_str();
            let chain_name = chain_code_to_display(chain_code).to_string();
            let (name, image_url) = parse_nft_metadata(&r.metadata);
            NftDisplay {
                id: r.id,
                contract: r.contract,
                token_id: r.token_id,
                chain: r.chain,
                chain_name,
                name,
                image_url,
            }
        })
        .collect())
}

fn parse_nft_metadata(metadata: &Option<String>) -> (Option<String>, Option<String>) {
    let Some(json) = metadata else {
        return (None, None);
    };
    let v: serde_json::Value = match serde_json::from_str(json) {
        Ok(x) => x,
        Err(_) => return (None, None),
    };
    let name = v
        .get("title")
        .or_else(|| v.get("name"))
        .and_then(|n| n.as_str())
        .map(String::from);
    let image_url = v
        .get("media")
        .and_then(|m| m.get(0))
        .and_then(|m| m.get("gateway").or_else(|| m.get("raw")))
        .and_then(|u| u.as_str())
        .or_else(|| v.get("image").and_then(|i| i.as_str()))
        .map(String::from);
    (name, image_url)
}
