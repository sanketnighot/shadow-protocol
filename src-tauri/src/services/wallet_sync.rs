//! Background wallet sync: fetch tokens, NFTs, and tx history from Alchemy, store in local DB.

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::chain::network_to_chain_display;
use super::local_db::{self, NftRow, TokenRow, TransactionRow};
use super::portfolio_service::{self, PortfolioAsset};

const ALL_NETWORKS: &[&str] = &[
    "eth-mainnet",
    "base-mainnet",
    "polygon-mainnet",
    "eth-sepolia",
    "base-sepolia",
    "polygon-amoy",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProgressPayload {
    pub address: String,
    pub step: String,
    pub progress: u8,
    pub total: u8,
    pub wallet_index: usize,
    pub wallet_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncDonePayload {
    pub address: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn emit_progress(app: &AppHandle, payload: &SyncProgressPayload) {
    let _ = app.emit("wallet_sync_progress", payload);
}

fn emit_done(app: &AppHandle, payload: &SyncDonePayload) {
    let _ = app.emit("wallet_sync_done", payload);
}

fn portfolio_asset_to_token_row(asset: &PortfolioAsset, chain_code: &str) -> TokenRow {
    TokenRow {
        id: asset.id.clone(),
        wallet_address: asset.wallet_address.clone().unwrap_or_default(),
        chain: chain_code.to_string(),
        token_contract: asset.token_contract.clone(),
        symbol: asset.symbol.clone(),
        balance: asset.balance.clone(),
        value_usd: asset.value_usd.clone(),
        decimals: asset.decimals,
        asset_type: asset.asset_type.clone(),
    }
}

async fn fetch_nfts_for_network(
    address: &str,
    network: &str,
    api_key: &str,
) -> Result<Vec<NftRow>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!(
        "https://{}.g.alchemy.com/nft/v3/{}/getNFTsForOwner?owner={}&pageSize=100",
        network, api_key, address
    );

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("NFT API error: {}", resp.status()));
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let empty: Vec<serde_json::Value> = Vec::new();
    let owned = body
        .get("ownedNfts")
        .and_then(|v| v.as_array())
        .unwrap_or(&empty);

    let (_, chain_code) = network_to_chain_display(network);
    let mut rows = Vec::new();
    for nft in owned {
        let contract = nft
            .get("contract")
            .and_then(|c| c.get("address"))
            .and_then(|a| a.as_str())
            .unwrap_or("");
        let token_id = nft
            .get("tokenId")
            .map(|t| {
                t.as_str()
                    .map(String::from)
                    .unwrap_or_else(|| t.as_u64().map(|u| u.to_string()).unwrap_or_default())
            })
            .unwrap_or_default();
        let id = format!("nft-{}-{}-{}", chain_code, contract, token_id);
        let metadata = serde_json::to_string(nft).ok();
        rows.push(NftRow {
            id,
            contract: contract.to_string(),
            token_id,
            metadata,
        });
    }
    Ok(rows)
}

async fn fetch_asset_transfers_for_network(
    address: &str,
    network: &str,
    api_key: &str,
) -> Result<Vec<TransactionRow>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let rpc_url = format!("https://{}.g.alchemy.com/v2/{}", network, api_key);

    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "alchemy_getAssetTransfers",
        "params": [{
            "fromAddress": address,
            "category": ["external", "internal", "erc20", "erc721", "erc1155"],
            "maxCount": "0x3e8"
        }],
        "id": 1
    });

    let resp = client
        .post(&rpc_url)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Transfers API error: {}", resp.status()));
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let result = body.get("result").and_then(|r| r.as_object());
    let empty: Vec<serde_json::Value> = Vec::new();
    let transfers = result
        .and_then(|r| r.get("transfers"))
        .and_then(|t| t.as_array())
        .unwrap_or(&empty);

    let (_, chain_code) = network_to_chain_display(network);
    let mut rows = Vec::new();
    for t in transfers {
        let hash = t.get("hash").and_then(|h| h.as_str()).unwrap_or("");
        if hash.is_empty() {
            continue;
        }
        let id = format!("tx-{}-{}", chain_code, hash);
        let block_num = t
            .get("blockNum")
            .and_then(|b| b.as_str())
            .and_then(|s| i64::from_str_radix(s.trim_start_matches("0x"), 16).ok());
        let timestamp = t
            .get("metadata")
            .and_then(|m| m.get("blockTimestamp"))
            .and_then(|ts| ts.as_str())
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.timestamp());
        rows.push(TransactionRow {
            id: id.clone(),
            tx_hash: hash.to_string(),
            chain: chain_code.to_string(),
            from_addr: t.get("from").and_then(|f| f.as_str()).map(String::from),
            to_addr: t.get("to").and_then(|t| t.as_str()).map(String::from),
            value: t
                .get("value")
                .and_then(|v| v.as_f64())
                .map(|v| v.to_string()),
            block_number: block_num,
            timestamp,
            category: t.get("category").and_then(|c| c.as_str()).map(String::from),
            metadata: serde_json::to_string(t).ok(),
        });
    }
    Ok(rows)
}

fn snapshot_from_assets(assets: &[PortfolioAsset]) {
    let mut by_wallet = std::collections::HashMap::<String, f64>::new();
    let mut by_chain = std::collections::HashMap::<String, f64>::new();
    let mut top_assets = Vec::new();
    let mut total = 0.0;

    for asset in assets {
        let value = asset
            .value_usd
            .replace(['$', ','], "")
            .parse::<f64>()
            .unwrap_or(0.0);
        total += value;
        if let Some(wallet) = asset.wallet_address.as_ref() {
            *by_wallet.entry(wallet.clone()).or_insert(0.0) += value;
        }
        *by_chain.entry(asset.chain.clone()).or_insert(0.0) += value;
        top_assets.push(serde_json::json!({
            "symbol": asset.symbol,
            "valueUsd": asset.value_usd,
        }));
    }

    top_assets.sort_by(|a, b| {
        let av = a.get("valueUsd").and_then(|v| v.as_str()).unwrap_or("$0.00").replace(['$', ','], "").parse::<f64>().unwrap_or(0.0);
        let bv = b.get("valueUsd").and_then(|v| v.as_str()).unwrap_or("$0.00").replace(['$', ','], "").parse::<f64>().unwrap_or(0.0);
        bv.partial_cmp(&av).unwrap_or(std::cmp::Ordering::Equal)
    });
    top_assets.truncate(5);

    let wallet_breakdown = by_wallet
        .into_iter()
        .map(|(wallet, value)| serde_json::json!({ "wallet": wallet, "valueUsd": format!("${value:.2}") }))
        .collect::<Vec<_>>();
    let chain_breakdown = by_chain
        .into_iter()
        .map(|(chain, value)| serde_json::json!({ "chain": chain, "valueUsd": format!("${value:.2}") }))
        .collect::<Vec<_>>();

    let _ = local_db::insert_portfolio_snapshot_full(
        &format!("${total:.2}"),
        &serde_json::to_string(&top_assets).unwrap_or_else(|_| "[]".to_string()),
        &serde_json::to_string(&wallet_breakdown).unwrap_or_else(|_| "[]".to_string()),
        &serde_json::to_string(&chain_breakdown).unwrap_or_else(|_| "[]".to_string()),
        "$0.00",
        &format!("${total:.2}"),
    );
}

pub async fn sync_wallet(app: AppHandle, address: String, wallet_index: usize, wallet_count: usize) {
    let api_key = match super::settings::get_alchemy_key_or_env() {
        Some(k) => k,
        None => {
            emit_done(
                &app,
                &SyncDonePayload {
                    address: address.clone(),
                    success: false,
                    error: Some("Missing ALCHEMY_API_KEY. Set it in Settings.".into()),
                },
            );
            return;
        }
    };

    let _ = local_db::set_wallet_sync_status(&address, "syncing", None);

    // Step 1: Tokens (0-33%)
    emit_progress(
        &app,
        &SyncProgressPayload {
            address: address.clone(),
            step: "tokens".to_string(),
            progress: 10,
            total: 100,
            wallet_index,
            wallet_count,
        },
    );

    let assets = match portfolio_service::fetch_balances(&address).await {
        Ok(a) => a,
        Err(e) => {
            let _ = local_db::set_wallet_sync_status(&address, "error", None);
            emit_done(
                &app,
                &SyncDonePayload {
                    address: address.clone(),
                    success: false,
                    error: Some(e.to_string()),
                },
            );
            return;
        }
    };

    // Group assets by chain and upsert
    let mut by_chain: std::collections::HashMap<String, Vec<TokenRow>> = std::collections::HashMap::new();
    for asset in &assets {
        let row = portfolio_asset_to_token_row(asset, &asset.chain);
        by_chain
            .entry(asset.chain.clone())
            .or_default()
            .push(row);
    }
    for (chain, rows) in &by_chain {
        let _ = local_db::upsert_tokens(&address, chain, rows);
    }
    snapshot_from_assets(&assets);

    emit_progress(
        &app,
        &SyncProgressPayload {
            address: address.clone(),
            step: "tokens".to_string(),
            progress: 33,
            total: 100,
            wallet_index,
            wallet_count,
        },
    );

    // Step 2: NFTs (33-66%)
    emit_progress(
        &app,
        &SyncProgressPayload {
            address: address.clone(),
            step: "nfts".to_string(),
            progress: 40,
            total: 100,
            wallet_index,
            wallet_count,
        },
    );

    for (i, network) in ALL_NETWORKS.iter().enumerate() {
        if let Ok(nfts) = fetch_nfts_for_network(&address, network, &api_key).await {
            let (_, chain_code) = network_to_chain_display(network);
            let _ = local_db::upsert_nfts(&address, chain_code, &nfts);
        }
        let pct = 40 + (i + 1) * 26 / ALL_NETWORKS.len();
        emit_progress(
            &app,
            &SyncProgressPayload {
                address: address.clone(),
                step: "nfts".to_string(),
                progress: pct as u8,
                total: 100,
                wallet_index,
                wallet_count,
            },
        );
    }

    // Step 3: Transactions (66-100%)
    emit_progress(
        &app,
        &SyncProgressPayload {
            address: address.clone(),
            step: "transactions".to_string(),
            progress: 70,
            total: 100,
            wallet_index,
            wallet_count,
        },
    );

    for (i, network) in ALL_NETWORKS.iter().enumerate() {
        if let Ok(txs) = fetch_asset_transfers_for_network(&address, network, &api_key).await {
            let (_, chain_code) = network_to_chain_display(network);
            let _ = local_db::upsert_transactions(&address, chain_code, &txs);
        }
        let pct = 70 + (i + 1) * 30 / ALL_NETWORKS.len();
        emit_progress(
            &app,
            &SyncProgressPayload {
                address: address.clone(),
                step: "transactions".to_string(),
                progress: pct as u8,
                total: 100,
                wallet_index,
                wallet_count,
            },
        );
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let _ = local_db::set_wallet_sync_status(&address, "done", Some(now));

    // After a successful sync, capture a portfolio snapshot for historical tracking
    let addresses = crate::commands::get_addresses(&app);
    if !addresses.is_empty() {
        let _h = app.clone();
        let market_addresses = addresses.clone();
        tokio::spawn(async move {
            let addrs_refs: Vec<&str> = addresses.iter().map(|s| s.as_str()).collect();
            if let Ok(total) = super::tools::get_total_portfolio_value_multi(&addrs_refs).await {
                let top_assets = total.breakdown.iter().take(5).collect::<Vec<_>>();
                let top_assets_json = serde_json::to_string(&top_assets).unwrap_or_else(|_| "[]".to_string());
                let _ = local_db::insert_portfolio_snapshot(&total.total_usd, &top_assets_json);
            }
        });
        let market_app = app.clone();
        tokio::spawn(async move {
            let _ = super::market_service::refresh_opportunities(
                Some(&market_app),
                super::market_service::MarketRefreshInput {
                    include_research: Some(false),
                    wallet_addresses: Some(market_addresses),
                    force: Some(false),
                },
            )
            .await;
        });
    }

    emit_progress(
        &app,
        &SyncProgressPayload {
            address: address.clone(),
            step: "done".to_string(),
            progress: 100,
            total: 100,
            wallet_index,
            wallet_count,
        },
    );

    emit_done(
        &app,
        &SyncDonePayload {
            address,
            success: true,
            error: None,
        },
    );
}
