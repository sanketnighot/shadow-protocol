use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tracing::{info, warn};

use crate::commands;
use crate::services::local_db::{self, MarketOpportunityRecord, MarketProviderRunRecord};
use crate::services::market_provider::{
    self, CatalystCandidate, MarketCandidate, RebalanceCandidate,
};
use crate::services::market_ranker;

const MARKET_PROVIDER_NAME: &str = "defillama";
const RESEARCH_PROVIDER_NAME: &str = "sonar_research";
const MARKET_REFRESH_INTERVAL_SECS: i64 = 15 * 60;
const RESEARCH_REFRESH_INTERVAL_SECS: i64 = 60 * 60;
const DEFAULT_FETCH_LIMIT: u32 = 24;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketOpportunityMetric {
    pub label: String,
    pub value: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketPortfolioFit {
    pub has_required_asset: bool,
    pub wallet_coverage: String,
    pub guardrail_fit: bool,
    pub relevance_reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketPrimaryAction {
    pub kind: String,
    pub label: String,
    pub enabled: bool,
    pub reason_disabled: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MarketOpportunityCompactDetails {
    pub thesis: Vec<String>,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketOpportunity {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub category: String,
    pub chain: String,
    pub protocol: Option<String>,
    pub symbols: Vec<String>,
    pub risk: String,
    pub confidence: f64,
    pub score: f64,
    pub actionability: String,
    pub fresh_until: Option<i64>,
    pub stale: bool,
    pub source_count: usize,
    pub source_labels: Vec<String>,
    pub metrics: Vec<MarketOpportunityMetric>,
    pub portfolio_fit: MarketPortfolioFit,
    pub primary_action: MarketPrimaryAction,
    pub details: MarketOpportunityCompactDetails,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketOpportunitySource {
    pub label: String,
    pub url: Option<String>,
    pub note: Option<String>,
    pub captured_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MarketRankingBreakdown {
    pub global_score: f64,
    pub personal_score: f64,
    pub total_score: f64,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MarketStoredDetailData {
    pub details: MarketOpportunityCompactDetails,
    pub ranking_breakdown: MarketRankingBreakdown,
    pub guardrail_notes: Vec<String>,
    pub execution_readiness_notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketOpportunityDetail {
    pub opportunity: MarketOpportunity,
    pub sources: Vec<MarketOpportunitySource>,
    pub ranking_breakdown: MarketRankingBreakdown,
    pub guardrail_notes: Vec<String>,
    pub execution_readiness_notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketOpportunitiesResponse {
    pub items: Vec<MarketOpportunity>,
    pub generated_at: i64,
    pub next_refresh_at: i64,
    pub stale: bool,
    pub available_chains: Vec<String>,
    pub available_categories: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketFetchInput {
    pub category: Option<String>,
    pub chain: Option<String>,
    pub include_research: Option<bool>,
    pub wallet_addresses: Option<Vec<String>>,
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketRefreshInput {
    pub include_research: Option<bool>,
    pub wallet_addresses: Option<Vec<String>>,
    pub force: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketRefreshResult {
    pub item_count: usize,
    pub generated_at: i64,
    pub stale: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketOpportunityDetailInput {
    pub opportunity_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketPrepareOpportunityActionInput {
    pub opportunity_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum MarketPrepareOpportunityActionResult {
    ApprovalRequired {
        approval_id: String,
        tool_name: String,
        message: String,
        payload: serde_json::Value,
        expected_version: i64,
    },
    AgentDraft {
        title: String,
        prompt: String,
    },
    DetailOnly {
        reason: String,
    },
}

#[derive(Debug, Clone)]
pub struct MarketContext {
    pub total_usd: f64,
    pub wallet_count: usize,
    pub holdings_by_symbol: std::collections::HashMap<String, f64>,
    pub holdings_by_chain: std::collections::HashMap<String, f64>,
    pub stablecoin_usd: f64,
}

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let addresses = commands::get_addresses(&app);
        let initial = MarketRefreshInput {
            include_research: Some(true),
            wallet_addresses: Some(addresses),
            force: Some(false),
        };
        let _ = refresh_opportunities(Some(&app), initial).await;

        let mut tick = tokio::time::interval(std::time::Duration::from_secs(
            MARKET_REFRESH_INTERVAL_SECS as u64,
        ));
        let mut rounds: u64 = 0;

        loop {
            tick.tick().await;
            rounds += 1;
            let include_research = rounds % 4 == 0;
            let input = MarketRefreshInput {
                include_research: Some(include_research),
                wallet_addresses: Some(commands::get_addresses(&app)),
                force: Some(false),
            };
            if let Err(error) = refresh_opportunities(Some(&app), input).await {
                warn!("market_service.refresh_failed: {}", error);
            }
        }
    });
}

pub async fn fetch_opportunities(input: MarketFetchInput) -> Result<MarketOpportunitiesResponse, String> {
    let include_research = input.include_research.unwrap_or(true);
    let wallet_addresses = sanitize_wallet_addresses(input.wallet_addresses);
    let now = now_secs();

    let count = local_db::count_market_opportunities().map_err(|e| e.to_string())?;
    if count == 0 || !cache_is_fresh(include_research, now)? {
        let _ = refresh_opportunities(
            None,
            MarketRefreshInput {
                include_research: Some(include_research),
                wallet_addresses: Some(wallet_addresses.clone()),
                force: Some(false),
            },
        )
        .await;
    }

    let records = local_db::get_market_opportunities(
        input.category.as_deref(),
        input.chain.as_deref(),
        include_research,
        input.limit.unwrap_or(DEFAULT_FETCH_LIMIT),
    )
    .map_err(|e| e.to_string())?;

    let items = records.iter().map(record_to_opportunity).collect::<Vec<_>>();
    let generated_at = records.iter().map(|record| record.last_seen_at).max().unwrap_or(now);
    let stale = records.is_empty()
        || records.iter().any(|record| {
            record.stale || record.fresh_until.map(|ts| ts < now).unwrap_or(false)
        });

    Ok(MarketOpportunitiesResponse {
        items,
        generated_at,
        next_refresh_at: generated_at + MARKET_REFRESH_INTERVAL_SECS,
        stale,
        available_chains: supported_chains(),
        available_categories: supported_categories(include_research),
    })
}

pub async fn refresh_opportunities(
    app: Option<&AppHandle>,
    input: MarketRefreshInput,
) -> Result<MarketRefreshResult, String> {
    let include_research = input.include_research.unwrap_or(true);
    let force = input.force.unwrap_or(false);
    let wallet_addresses = sanitize_wallet_addresses(input.wallet_addresses);
    let now = now_secs();

    if !force && cache_is_fresh(include_research, now)? {
        let count = local_db::count_market_opportunities().map_err(|e| e.to_string())?;
        return Ok(MarketRefreshResult {
            item_count: count.max(0) as usize,
            generated_at: now,
            stale: false,
        });
    }

    let mut provider_run = MarketProviderRunRecord {
        id: uuid::Uuid::new_v4().to_string(),
        provider: MARKET_PROVIDER_NAME.to_string(),
        status: "running".to_string(),
        items_seen: 0,
        error_summary: None,
        started_at: now,
        completed_at: None,
    };
    local_db::insert_market_provider_run(&provider_run).map_err(|e| e.to_string())?;

    let yield_candidates = match market_provider::defillama::fetch_yield_candidates(now).await {
        Ok(items) => items,
        Err(error) => {
            provider_run.status = "failed".to_string();
            provider_run.error_summary = Some(error.clone());
            provider_run.completed_at = Some(now_secs());
            let _ = local_db::update_market_provider_run(&provider_run);
            return fallback_to_cached(app, &error, now);
        }
    };

    let spread_candidates = market_provider::derive_spread_watch_candidates(&yield_candidates, now);
    let context = build_market_context(&wallet_addresses)?;
    let rebalance_candidates = build_rebalance_candidates(&context, now);

    provider_run.status = "succeeded".to_string();
    provider_run.items_seen = (yield_candidates.len() + spread_candidates.len() + rebalance_candidates.len()) as i64;
    provider_run.completed_at = Some(now_secs());
    local_db::update_market_provider_run(&provider_run).map_err(|e| e.to_string())?;

    let research_candidates = if include_research {
        refresh_research_provider(now).await.unwrap_or_default()
    } else {
        Vec::new()
    };

    let mut candidates = Vec::new();
    candidates.extend(yield_candidates.into_iter().map(MarketCandidate::Yield));
    candidates.extend(
        spread_candidates
            .into_iter()
            .map(MarketCandidate::SpreadWatch),
    );
    candidates.extend(
        rebalance_candidates
            .into_iter()
            .map(MarketCandidate::Rebalance),
    );
    candidates.extend(
        research_candidates
            .into_iter()
            .map(MarketCandidate::Catalyst),
    );

    let ranked = market_ranker::rank_candidates(candidates, &context, now);
    if ranked.is_empty() {
        return fallback_to_cached(app, "No opportunities were produced after ranking", now);
    }

    let records = ranked
        .iter()
        .map(|ranked_item| ranked_to_record(ranked_item, now))
        .collect::<Vec<_>>();
    local_db::replace_market_opportunities(&records).map_err(|e| e.to_string())?;

    let result = MarketRefreshResult {
        item_count: ranked.len(),
        generated_at: now,
        stale: false,
    };
    if let Some(app) = app {
        let response = MarketOpportunitiesResponse {
            items: ranked.into_iter().map(|ranked_item| ranked_item.opportunity).collect(),
            generated_at: now,
            next_refresh_at: now + MARKET_REFRESH_INTERVAL_SECS,
            stale: false,
            available_chains: supported_chains(),
            available_categories: supported_categories(include_research),
        };
        let _ = app.emit("market_opportunities_updated", response);
    }
    info!("market_service.refresh_succeeded items={}", result.item_count);
    Ok(result)
}

pub fn get_opportunity_detail(input: MarketOpportunityDetailInput) -> Result<MarketOpportunityDetail, String> {
    let id = input.opportunity_id.trim();
    if id.is_empty() {
        return Err("Opportunity id is required".to_string());
    }
    let record = local_db::get_market_opportunity(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Market opportunity not found".to_string())?;
    let opportunity = record_to_opportunity(&record);
    let detail = parse_detail_payload(&record.details_json);
    Ok(MarketOpportunityDetail {
        opportunity,
        sources: parse_sources(&record.sources_json),
        ranking_breakdown: detail.ranking_breakdown,
        guardrail_notes: detail.guardrail_notes,
        execution_readiness_notes: detail.execution_readiness_notes,
    })
}

pub fn get_cached_opportunity(opportunity_id: &str) -> Result<MarketOpportunity, String> {
    let record = local_db::get_market_opportunity(opportunity_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Market opportunity not found".to_string())?;
    Ok(record_to_opportunity(&record))
}

pub fn top_cached_opportunity() -> Result<Option<MarketOpportunity>, String> {
    let mut items = local_db::get_market_opportunities(None, None, true, 1).map_err(|e| e.to_string())?;
    Ok(items.pop().map(|record| record_to_opportunity(&record)))
}

fn supported_chains() -> Vec<String> {
    vec![
        "all".to_string(),
        "ethereum".to_string(),
        "base".to_string(),
        "polygon".to_string(),
        "multi_chain".to_string(),
    ]
}

fn supported_categories(include_research: bool) -> Vec<String> {
    let mut categories = vec![
        "all".to_string(),
        "yield".to_string(),
        "spread_watch".to_string(),
        "rebalance".to_string(),
    ];
    if include_research {
        categories.push("catalyst".to_string());
    }
    categories
}

fn sanitize_wallet_addresses(wallet_addresses: Option<Vec<String>>) -> Vec<String> {
    wallet_addresses
        .unwrap_or_default()
        .into_iter()
        .map(|address| address.trim().to_string())
        .filter(|address| address.starts_with("0x") && address.len() == 42)
        .collect()
}

fn build_market_context(wallet_addresses: &[String]) -> Result<MarketContext, String> {
    let rows = if wallet_addresses.is_empty() {
        Vec::new()
    } else {
        local_db::get_tokens_for_wallets(wallet_addresses).map_err(|e| e.to_string())?
    };

    let mut holdings_by_symbol = std::collections::HashMap::<String, f64>::new();
    let mut holdings_by_chain = std::collections::HashMap::<String, f64>::new();
    let mut total_usd = 0.0;
    let mut stablecoin_usd = 0.0;

    for row in rows {
        let value = parse_money(&row.value_usd);
        total_usd += value;
        *holdings_by_symbol.entry(row.symbol.clone()).or_insert(0.0) += value;
        let market_chain = normalize_chain_code(&row.chain);
        *holdings_by_chain.entry(market_chain.to_string()).or_insert(0.0) += value;
        if row.asset_type == "stablecoin" {
            stablecoin_usd += value;
        }
    }

    Ok(MarketContext {
        total_usd,
        wallet_count: wallet_addresses.len(),
        holdings_by_symbol,
        holdings_by_chain,
        stablecoin_usd,
    })
}

fn build_rebalance_candidates(context: &MarketContext, now: i64) -> Vec<RebalanceCandidate> {
    if context.total_usd <= 0.0 || context.wallet_count == 0 {
        return Vec::new();
    }

    let mut out = Vec::new();
    let stablecoin_pct = if context.total_usd > 0.0 {
        (context.stablecoin_usd / context.total_usd) * 100.0
    } else {
        0.0
    };

    if stablecoin_pct > 55.0 {
        let drift = stablecoin_pct - 40.0;
        out.push(RebalanceCandidate {
            id_seed: "rebalance:stablecoin".to_string(),
            title: "Stablecoin allocation rebalance".to_string(),
            summary: format!(
                "Stablecoin exposure is {:.1}% of portfolio value, above the 40% baseline target. Queue a guarded rebalance draft.",
                stablecoin_pct
            ),
            chain: "multi_chain".to_string(),
            symbols: vec!["USDC".to_string(), "ETH".to_string()],
            drift_pct: drift,
            estimated_notional_usd: context.total_usd * (drift / 100.0),
            sources: vec![market_provider::CandidateSource {
                label: "Portfolio".to_string(),
                url: None,
                note: Some("Derived from local wallet allocation".to_string()),
                captured_at: Some(now),
            }],
            fresh_until: now + MARKET_REFRESH_INTERVAL_SECS,
        });
    }

    for (chain, value) in &context.holdings_by_chain {
        let pct = if context.total_usd > 0.0 {
            (*value / context.total_usd) * 100.0
        } else {
            0.0
        };
        if pct <= 65.0 {
            continue;
        }
        out.push(RebalanceCandidate {
            id_seed: format!("rebalance:chain:{chain}"),
            title: format!("{} concentration rebalance", display_chain(chain)),
            summary: format!(
                "{} accounts for {:.1}% of tracked value. Review a controlled rebalance to reduce concentration risk.",
                display_chain(chain),
                pct
            ),
            chain: "multi_chain".to_string(),
            symbols: vec![chain_symbol(chain).to_string()],
            drift_pct: pct - 45.0,
            estimated_notional_usd: context.total_usd * ((pct - 45.0) / 100.0),
            sources: vec![market_provider::CandidateSource {
                label: "Portfolio".to_string(),
                url: None,
                note: Some("Derived from local chain concentration".to_string()),
                captured_at: Some(now),
            }],
            fresh_until: now + MARKET_REFRESH_INTERVAL_SECS,
        });
    }

    out
}

async fn refresh_research_provider(now: i64) -> Result<Vec<CatalystCandidate>, String> {
    let mut provider_run = MarketProviderRunRecord {
        id: uuid::Uuid::new_v4().to_string(),
        provider: RESEARCH_PROVIDER_NAME.to_string(),
        status: "running".to_string(),
        items_seen: 0,
        error_summary: None,
        started_at: now,
        completed_at: None,
    };
    local_db::insert_market_provider_run(&provider_run).map_err(|e| e.to_string())?;

    match market_provider::research::fetch_catalyst_candidates(now).await {
        Ok(items) => {
            provider_run.status = "succeeded".to_string();
            provider_run.items_seen = items.len() as i64;
            provider_run.completed_at = Some(now_secs());
            local_db::update_market_provider_run(&provider_run).map_err(|e| e.to_string())?;
            Ok(items)
        }
        Err(error) => {
            provider_run.status = "failed".to_string();
            provider_run.error_summary = Some(error.clone());
            provider_run.completed_at = Some(now_secs());
            let _ = local_db::update_market_provider_run(&provider_run);
            Ok(Vec::new())
        }
    }
}

fn cache_is_fresh(include_research: bool, now: i64) -> Result<bool, String> {
    let market_fresh = local_db::get_latest_market_provider_run(MARKET_PROVIDER_NAME)
        .map_err(|e| e.to_string())?
        .map(|run| {
            run.status == "succeeded"
                && run
                    .completed_at
                    .map(|completed_at| now - completed_at <= MARKET_REFRESH_INTERVAL_SECS)
                    .unwrap_or(false)
        })
        .unwrap_or(false);

    if !market_fresh {
        return Ok(false);
    }

    if !include_research {
        return Ok(true);
    }

    let research_fresh = local_db::get_latest_market_provider_run(RESEARCH_PROVIDER_NAME)
        .map_err(|e| e.to_string())?
        .map(|run| {
            run.status == "succeeded"
                && run
                    .completed_at
                    .map(|completed_at| now - completed_at <= RESEARCH_REFRESH_INTERVAL_SECS)
                    .unwrap_or(false)
        })
        .unwrap_or(false);

    Ok(research_fresh || !has_research_records()?)
}

fn has_research_records() -> Result<bool, String> {
    let items = local_db::get_market_opportunities(Some("catalyst"), None, true, 1)
        .map_err(|e| e.to_string())?;
    Ok(!items.is_empty())
}

fn fallback_to_cached(
    app: Option<&AppHandle>,
    error: &str,
    now: i64,
) -> Result<MarketRefreshResult, String> {
    let count = local_db::count_market_opportunities().map_err(|e| e.to_string())?;
    if count > 0 {
        if let Some(app) = app {
            let payload = serde_json::json!({
                "message": "Serving cached market opportunities.",
                "stale": true,
                "generatedAt": now,
            });
            let _ = app.emit("market_opportunities_refresh_failed", payload);
        }
        warn!("market_service.using_cached_results: {}", error);
        return Ok(MarketRefreshResult {
            item_count: count as usize,
            generated_at: now,
            stale: true,
        });
    }
    Err(error.to_string())
}

fn ranked_to_record(
    ranked: &market_ranker::RankedMarketOpportunity,
    now: i64,
) -> MarketOpportunityRecord {
    let opportunity = &ranked.opportunity;
    MarketOpportunityRecord {
        id: opportunity.id.clone(),
        fingerprint: format!("{}:{}:{}", opportunity.category, opportunity.chain, opportunity.title),
        title: opportunity.title.clone(),
        summary: opportunity.summary.clone(),
        category: opportunity.category.clone(),
        chain: opportunity.chain.clone(),
        protocol: opportunity.protocol.clone(),
        symbols_json: serde_json::to_string(&opportunity.symbols).unwrap_or_else(|_| "[]".to_string()),
        risk: opportunity.risk.clone(),
        confidence: opportunity.confidence,
        score: opportunity.score,
        actionability: opportunity.actionability.clone(),
        metrics_json: serde_json::to_string(&opportunity.metrics).unwrap_or_else(|_| "[]".to_string()),
        portfolio_fit_json: serde_json::to_string(&opportunity.portfolio_fit)
            .unwrap_or_else(|_| "{\"hasRequiredAsset\":false,\"walletCoverage\":\"0/0 wallets\",\"guardrailFit\":false,\"relevanceReasons\":[]}".to_string()),
        primary_action_json: serde_json::to_string(&opportunity.primary_action)
            .unwrap_or_else(|_| "{\"kind\":\"open_detail\",\"label\":\"View detail\",\"enabled\":true}".to_string()),
        details_json: serde_json::to_string(&ranked.detail).unwrap_or_else(|_| "{}".to_string()),
        sources_json: serde_json::to_string(&ranked.sources).unwrap_or_else(|_| "[]".to_string()),
        stale: false,
        fresh_until: opportunity.fresh_until,
        first_seen_at: now,
        last_seen_at: now,
        expires_at: opportunity.fresh_until.map(|ts| ts + MARKET_REFRESH_INTERVAL_SECS),
    }
}

fn record_to_opportunity(record: &MarketOpportunityRecord) -> MarketOpportunity {
    let detail = parse_detail_payload(&record.details_json);
    let sources = parse_sources(&record.sources_json);
    let source_labels = sources.iter().map(|source| source.label.clone()).collect::<Vec<_>>();
    MarketOpportunity {
        id: record.id.clone(),
        title: record.title.clone(),
        summary: record.summary.clone(),
        category: record.category.clone(),
        chain: record.chain.clone(),
        protocol: record.protocol.clone(),
        symbols: serde_json::from_str(&record.symbols_json).unwrap_or_default(),
        risk: record.risk.clone(),
        confidence: record.confidence,
        score: record.score,
        actionability: record.actionability.clone(),
        fresh_until: record.fresh_until,
        stale: record.stale,
        source_count: source_labels.len(),
        source_labels,
        metrics: serde_json::from_str(&record.metrics_json).unwrap_or_default(),
        portfolio_fit: serde_json::from_str(&record.portfolio_fit_json).unwrap_or_else(|_| MarketPortfolioFit {
            has_required_asset: false,
            wallet_coverage: "0/0 wallets".to_string(),
            guardrail_fit: false,
            relevance_reasons: Vec::new(),
        }),
        primary_action: serde_json::from_str(&record.primary_action_json).unwrap_or(MarketPrimaryAction {
            kind: "open_detail".to_string(),
            label: "View detail".to_string(),
            enabled: true,
            reason_disabled: None,
        }),
        details: detail.details,
    }
}

fn parse_sources(raw: &str) -> Vec<MarketOpportunitySource> {
    serde_json::from_str(raw).unwrap_or_default()
}

fn parse_detail_payload(raw: &str) -> MarketStoredDetailData {
    serde_json::from_str(raw).unwrap_or_default()
}

fn normalize_chain_code(chain_code: &str) -> &'static str {
    match chain_code {
        "ETH" => "ethereum",
        "BASE" => "base",
        "POL" => "polygon",
        _ => "multi_chain",
    }
}

pub fn display_chain(chain: &str) -> &'static str {
    match chain {
        "ethereum" => "Ethereum",
        "base" => "Base",
        "polygon" => "Polygon",
        "multi_chain" => "Multi-chain",
        _ => "Unknown",
    }
}

pub fn chain_symbol(chain: &str) -> &'static str {
    match chain {
        "ethereum" => "ETH",
        "base" => "ETH",
        "polygon" => "POL",
        _ => "USDC",
    }
}

pub fn parse_money(value: &str) -> f64 {
    value.replace(['$', ','], "").parse::<f64>().unwrap_or(0.0)
}

pub fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}
