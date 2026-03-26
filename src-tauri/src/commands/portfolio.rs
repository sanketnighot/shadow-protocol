//! Portfolio balance fetching: local DB first, Alchemy fallback.

use serde::Deserialize;
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioHistoryInput {
    pub range: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioAllocationsInput {
    pub addresses: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioPerformanceSummaryInput {
    pub range: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioSnapshotPoint {
    pub timestamp: i64,
    pub total_usd: String,
    pub net_flow_usd: String,
    pub performance_usd: String,
    pub wallet_breakdown: Vec<AllocationValue>,
    pub chain_breakdown: Vec<AllocationValue>,
    pub top_assets: Vec<AssetValue>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioPerformanceSummary {
    pub current_total_usd: String,
    pub change_usd: String,
    pub change_pct: String,
    pub net_flow_usd: String,
    pub performance_usd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllocationValue {
    pub wallet: Option<String>,
    pub chain: Option<String>,
    pub symbol: Option<String>,
    pub value_usd: String,
    pub percentage: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetValue {
    pub symbol: String,
    pub value_usd: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioPerformanceRange {
    pub range: String,
    pub points: Vec<PortfolioSnapshotPoint>,
    pub summary: PortfolioPerformanceSummary,
    pub allocation_actual: Vec<AllocationValue>,
    pub allocation_target: Vec<AllocationValue>,
    pub wallet_attribution: Vec<AllocationValue>,
}

fn parse_money(input: &str) -> f64 {
    input.replace(['$', ','], "").parse::<f64>().unwrap_or(0.0)
}

fn range_to_limit(range: &str) -> u32 {
    match range {
        "1D" => 24,
        "7D" => 7,
        "30D" => 30,
        "90D" => 90,
        "1Y" => 365,
        _ => 365,
    }
}

fn aggregate_allocations(addresses: &[String]) -> Result<(Vec<AllocationValue>, Vec<AllocationValue>), String> {
    let rows = local_db::get_tokens_for_wallets(addresses).map_err(|e| e.to_string())?;
    let total: f64 = rows.iter().map(|row| parse_money(&row.value_usd)).sum();
    let mut by_symbol = std::collections::HashMap::<String, f64>::new();
    let mut by_wallet = std::collections::HashMap::<String, f64>::new();
    for row in rows {
        *by_symbol.entry(row.symbol.clone()).or_insert(0.0) += parse_money(&row.value_usd);
        *by_wallet.entry(row.wallet_address.clone()).or_insert(0.0) += parse_money(&row.value_usd);
    }
    let allocation_actual = by_symbol
        .into_iter()
        .map(|(symbol, value)| AllocationValue {
            wallet: None,
            chain: None,
            symbol: Some(symbol),
            value_usd: format!("${value:.2}"),
            percentage: Some(format!("{:.2}%", if total > 0.0 { value / total * 100.0 } else { 0.0 })),
        })
        .collect::<Vec<_>>();
    let wallet_attribution = by_wallet
        .into_iter()
        .map(|(wallet, value)| AllocationValue {
            wallet: Some(wallet),
            chain: None,
            symbol: None,
            value_usd: format!("${value:.2}"),
            percentage: Some(format!("{:.2}%", if total > 0.0 { value / total * 100.0 } else { 0.0 })),
        })
        .collect::<Vec<_>>();
    Ok((allocation_actual, wallet_attribution))
}

#[tauri::command]
pub async fn portfolio_fetch_history(input: PortfolioHistoryInput) -> Result<PortfolioPerformanceRange, String> {
    let limit = range_to_limit(input.range.as_str());
    let snapshots = local_db::get_portfolio_snapshots(limit).map_err(|e| e.to_string())?;
    let mut points = snapshots
        .into_iter()
        .rev()
        .map(|item| {
            let wallet_breakdown = serde_json::from_str::<Vec<AllocationValue>>(&item.wallet_breakdown_json).unwrap_or_default();
            let chain_breakdown = serde_json::from_str::<Vec<AllocationValue>>(&item.chain_breakdown_json).unwrap_or_default();
            let top_assets = serde_json::from_str::<Vec<AssetValue>>(&item.top_assets_json).unwrap_or_default();
            PortfolioSnapshotPoint {
                timestamp: item.timestamp,
                total_usd: item.total_usd,
                net_flow_usd: item.net_flow_usd,
                performance_usd: item.performance_usd,
                wallet_breakdown,
                chain_breakdown,
                top_assets,
            }
        })
        .collect::<Vec<_>>();

    if points.is_empty() {
        points.push(PortfolioSnapshotPoint {
            timestamp: 0,
            total_usd: "$0.00".to_string(),
            net_flow_usd: "$0.00".to_string(),
            performance_usd: "$0.00".to_string(),
            wallet_breakdown: Vec::new(),
            chain_breakdown: Vec::new(),
            top_assets: Vec::new(),
        });
    }

    let first = points.first().cloned().unwrap();
    let last = points.last().cloned().unwrap();
    let first_total = parse_money(&first.total_usd);
    let last_total = parse_money(&last.total_usd);
    let change = last_total - first_total;
    let change_pct = if first_total > 0.0 { change / first_total * 100.0 } else { 0.0 };
    let summary = PortfolioPerformanceSummary {
        current_total_usd: last.total_usd.clone(),
        change_usd: format!("${change:.2}"),
        change_pct: format!("{change_pct:.2}%"),
        net_flow_usd: last.net_flow_usd.clone(),
        performance_usd: last.performance_usd.clone(),
    };

    let addresses: Vec<String> = local_db::with_connection(|conn| {
        let mut stmt = conn.prepare("SELECT address FROM wallets ORDER BY address ASC")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }).map_err(|e| e.to_string())?;
    let (allocation_actual, wallet_attribution) = aggregate_allocations(&addresses)?;
    let allocation_target = local_db::get_target_allocations()
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|item| AllocationValue {
            wallet: None,
            chain: None,
            symbol: Some(item.symbol),
            value_usd: "$0.00".to_string(),
            percentage: Some(format!("{:.2}%", item.percentage)),
        })
        .collect::<Vec<_>>();

    Ok(PortfolioPerformanceRange {
        range: input.range,
        points,
        summary,
        allocation_actual,
        allocation_target,
        wallet_attribution,
    })
}

#[tauri::command]
pub async fn portfolio_fetch_allocations(input: PortfolioAllocationsInput) -> Result<Vec<AllocationValue>, String> {
    let addresses = input.addresses.unwrap_or_default();
    let (allocation_actual, _) = aggregate_allocations(&addresses)?;
    Ok(allocation_actual)
}

#[tauri::command]
pub async fn portfolio_fetch_performance_summary(input: PortfolioPerformanceSummaryInput) -> Result<PortfolioPerformanceSummary, String> {
    let history = portfolio_fetch_history(PortfolioHistoryInput { range: input.range }).await?;
    Ok(history.summary)
}
