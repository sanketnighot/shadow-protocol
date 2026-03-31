#![allow(dead_code)]
//! Opportunity scanner service for market opportunity detection and matching.
//!
//! Scans for DeFi opportunities (yield, swaps, staking) and matches them
//! against user preferences and portfolio context.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::info;

use super::local_db::{self, OpportunityMatchRecord};
use super::behavior_learner;

/// Opportunity type.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum OpportunityType {
    YieldFarm,
    LiquidityPool,
    Staking,
    Swap,
    Bridge,
    Airdrop,
    Governance,
}

/// Opportunity source.
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum OpportunitySource {
    Onchain,
    MarketData,
    Protocol,
    Community,
}

/// Market opportunity definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketOpportunity {
    pub id: String,
    pub opportunity_type: String,
    pub title: String,
    pub description: String,
    pub protocol: String,
    pub chain: String,
    pub tokens: Vec<String>,
    pub apy: Option<f64>,
    pub tvl_usd: Option<f64>,
    pub risk_level: String,
    pub requirements: Vec<String>,
    pub deadline: Option<i64>,
    pub source_url: Option<String>,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Matched opportunity with personalized scoring.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchedOpportunity {
    pub opportunity: MarketOpportunity,
    pub match_score: f64,
    pub match_reasons: Vec<String>,
    pub relevance_factors: RelevanceFactors,
    pub recommended_action: Option<String>,
    pub estimated_value_usd: Option<f64>,
}

/// Factors contributing to opportunity relevance.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RelevanceFactors {
    pub chain_preference: f64,
    pub token_preference: f64,
    pub risk_alignment: f64,
    pub portfolio_fit: f64,
    pub timing_score: f64,
}

/// Scanner configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannerConfig {
    pub min_match_score: f64,
    pub max_opportunities: usize,
    pub chains: Vec<String>,
    pub excluded_protocols: Vec<String>,
    pub max_risk_level: String,
}

impl Default for ScannerConfig {
    fn default() -> Self {
        Self {
            min_match_score: 0.5,
            max_opportunities: 10,
            chains: vec!["ethereum".to_string(), "base".to_string(), "polygon".to_string()],
            excluded_protocols: vec![],
            max_risk_level: "medium".to_string(),
        }
    }
}

/// Portfolio context for matching.
#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct PortfolioContext {
    pub total_value_usd: f64,
    pub holdings: Vec<HoldingInfo>,
    pub chain_distribution: HashMap<String, f64>,
    #[allow(dead_code)]
    pub stablecoin_pct: f64,
}

/// Holding information for matching.
#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct HoldingInfo {
    pub symbol: String,
    #[allow(dead_code)]
    pub value_usd: f64,
    #[allow(dead_code)]
    pub chain: String,
}

/// Scan for opportunities and match against user profile.
pub fn scan_opportunities(
    portfolio: &PortfolioContext,
    config: &ScannerConfig,
) -> Result<Vec<MatchedOpportunity>, String> {
    // Get available opportunities from market data
    let opportunities = fetch_opportunities(config)?;

    // Get user preferences
    let preferences = behavior_learner::get_preferences_map();

    // Match and score
    let mut matched = Vec::new();
    for opp in opportunities {
        if let Some(matched_opp) = match_opportunity(&opp, portfolio, &preferences, config) {
            if matched_opp.match_score >= config.min_match_score {
                matched.push(matched_opp);
            }
        }
    }

    // Sort by match score
    matched.sort_by(|a, b| {
        b.match_score.partial_cmp(&a.match_score).unwrap()
    });

    // Limit results
    matched.truncate(config.max_opportunities);

    // Persist matches
    for matched_opp in &matched {
        persist_match(matched_opp).ok();
    }

    info!(count = matched.len(), "opportunities.scanned");
    Ok(matched)
}

/// Fetch opportunities from data sources.
fn fetch_opportunities(config: &ScannerConfig) -> Result<Vec<MarketOpportunity>, String> {
    // In production, this would fetch from:
    // - Onchain protocols (via RPC calls)
    // - Market data APIs (DefiLlama, etc.)
    // - Protocol subgraphs
    // For now, return opportunities based on known protocols

    let mut opportunities = Vec::new();

    // Generate yield opportunities for each chain
    for chain in &config.chains {
        // Add known yield opportunities
        if chain == "ethereum" {
            opportunities.extend(get_ethereum_opportunities());
        } else if chain == "base" {
            opportunities.extend(get_base_opportunities());
        } else if chain == "polygon" {
            opportunities.extend(get_polygon_opportunities());
        }
    }

    // Filter out excluded protocols
    opportunities.retain(|o| !config.excluded_protocols.contains(&o.protocol));

    // Filter by risk level
    let risk_order = ["low", "medium", "high"];
    let max_risk_idx = risk_order.iter()
        .position(|&r| r == config.max_risk_level)
        .unwrap_or(1);

    opportunities.retain(|o| {
        let opp_risk_idx = risk_order.iter()
            .position(|&r| r == o.risk_level)
            .unwrap_or(1);
        opp_risk_idx <= max_risk_idx
    });

    Ok(opportunities)
}

/// Get Ethereum opportunities.
fn get_ethereum_opportunities() -> Vec<MarketOpportunity> {
    vec![
        MarketOpportunity {
            id: "eth-aave-usdc".to_string(),
            opportunity_type: OpportunityType::YieldFarm.to_string(),
            title: "USDC Lending on Aave".to_string(),
            description: "Supply USDC to Aave for stable yield".to_string(),
            protocol: "aave".to_string(),
            chain: "ethereum".to_string(),
            tokens: vec!["USDC".to_string()],
            apy: Some(4.5),
            tvl_usd: Some(2_500_000_000.0),
            risk_level: "low".to_string(),
            requirements: vec!["USDC balance".to_string()],
            deadline: None,
            source_url: Some("https://app.aave.com".to_string()),
            metadata: HashMap::new(),
        },
        MarketOpportunity {
            id: "eth-uni-eth-usdc".to_string(),
            opportunity_type: OpportunityType::LiquidityPool.to_string(),
            title: "ETH/USDC LP on Uniswap".to_string(),
            description: "Provide liquidity to ETH/USDC pool on Uniswap V3".to_string(),
            protocol: "uniswap".to_string(),
            chain: "ethereum".to_string(),
            tokens: vec!["ETH".to_string(), "USDC".to_string()],
            apy: Some(12.5),
            tvl_usd: Some(850_000_000.0),
            risk_level: "medium".to_string(),
            requirements: vec!["ETH balance".to_string(), "USDC balance".to_string()],
            deadline: None,
            source_url: Some("https://app.uniswap.org".to_string()),
            metadata: HashMap::new(),
        },
        MarketOpportunity {
            id: "eth-lido-steth".to_string(),
            opportunity_type: OpportunityType::Staking.to_string(),
            title: "Stake ETH with Lido".to_string(),
            description: "Stake ETH to receive stETH liquid staking token".to_string(),
            protocol: "lido".to_string(),
            chain: "ethereum".to_string(),
            tokens: vec!["ETH".to_string()],
            apy: Some(3.8),
            tvl_usd: Some(30_000_000_000.0),
            risk_level: "low".to_string(),
            requirements: vec!["ETH balance".to_string()],
            deadline: None,
            source_url: Some("https://lido.fi".to_string()),
            metadata: HashMap::new(),
        },
    ]
}

/// Get Base opportunities.
fn get_base_opportunities() -> Vec<MarketOpportunity> {
    vec![
        MarketOpportunity {
            id: "base-aave-usdc".to_string(),
            opportunity_type: OpportunityType::YieldFarm.to_string(),
            title: "USDC Lending on Aave Base".to_string(),
            description: "Supply USDC to Aave on Base for higher yield".to_string(),
            protocol: "aave".to_string(),
            chain: "base".to_string(),
            tokens: vec!["USDC".to_string()],
            apy: Some(6.2),
            tvl_usd: Some(450_000_000.0),
            risk_level: "low".to_string(),
            requirements: vec!["USDC balance on Base".to_string()],
            deadline: None,
            source_url: Some("https://app.aave.com".to_string()),
            metadata: HashMap::new(),
        },
        MarketOpportunity {
            id: "base-aerodrome-eth".to_string(),
            opportunity_type: OpportunityType::LiquidityPool.to_string(),
            title: "ETH Liquidity on Aerodrome".to_string(),
            description: "Provide ETH liquidity on Aerodrome DEX".to_string(),
            protocol: "aerodrome".to_string(),
            chain: "base".to_string(),
            tokens: vec!["ETH".to_string()],
            apy: Some(18.5),
            tvl_usd: Some(120_000_000.0),
            risk_level: "medium".to_string(),
            requirements: vec!["ETH balance on Base".to_string()],
            deadline: None,
            source_url: Some("https://aerodrome.finance".to_string()),
            metadata: HashMap::new(),
        },
    ]
}

/// Get Polygon opportunities.
fn get_polygon_opportunities() -> Vec<MarketOpportunity> {
    vec![
        MarketOpportunity {
            id: "polygon-aave-usdc".to_string(),
            opportunity_type: OpportunityType::YieldFarm.to_string(),
            title: "USDC Lending on Aave Polygon".to_string(),
            description: "Supply USDC to Aave on Polygon".to_string(),
            protocol: "aave".to_string(),
            chain: "polygon".to_string(),
            tokens: vec!["USDC".to_string()],
            apy: Some(5.8),
            tvl_usd: Some(280_000_000.0),
            risk_level: "low".to_string(),
            requirements: vec!["USDC balance on Polygon".to_string()],
            deadline: None,
            source_url: Some("https://app.aave.com".to_string()),
            metadata: HashMap::new(),
        },
        MarketOpportunity {
            id: "polygon-quickswap-eth-usdc".to_string(),
            opportunity_type: OpportunityType::LiquidityPool.to_string(),
            title: "ETH/USDC LP on QuickSwap".to_string(),
            description: "Provide liquidity on QuickSwap V3".to_string(),
            protocol: "quickswap".to_string(),
            chain: "polygon".to_string(),
            tokens: vec!["ETH".to_string(), "USDC".to_string()],
            apy: Some(15.2),
            tvl_usd: Some(65_000_000.0),
            risk_level: "medium".to_string(),
            requirements: vec!["ETH balance".to_string(), "USDC balance".to_string()],
            deadline: None,
            source_url: Some("https://quickswap.exchange".to_string()),
            metadata: HashMap::new(),
        },
    ]
}

/// Match a single opportunity against user profile.
fn match_opportunity(
    opp: &MarketOpportunity,
    portfolio: &PortfolioContext,
    preferences: &HashMap<String, f64>,
    _config: &ScannerConfig,
) -> Option<MatchedOpportunity> {
    let mut match_reasons = Vec::new();
    let mut factors = RelevanceFactors::default();

    // Check chain preference
    if let Some(chain_pref) = preferences.get(&format!("chain_{}", opp.chain)) {
        factors.chain_preference = *chain_pref;
        if *chain_pref > 0.5 {
            match_reasons.push(format!("You prefer {} chain", opp.chain));
        }
    } else {
        // Check if user has assets on this chain
        let chain_pct = portfolio.chain_distribution.get(&opp.chain).copied().unwrap_or(0.0);
        factors.chain_preference = chain_pct / 100.0;
    }

    // Check token preference
    let mut token_score = 0.0;
    for token in &opp.tokens {
        if let Some(token_pref) = preferences.get(&format!("token_{}", token)) {
            token_score += *token_pref;
        }
        // Check if user holds this token
        if portfolio.holdings.iter().any(|h| h.symbol == *token) {
            token_score += 0.3;
            match_reasons.push(format!("You hold {}", token));
        }
    }
    factors.token_preference = token_score / opp.tokens.len().max(1) as f64;

    // Check risk alignment
    let risk_tolerance = preferences.get("risk_tolerance").copied().unwrap_or(0.5);
    let risk_levels = [("low", 0.3), ("medium", 0.6), ("high", 0.9)];
    let opp_risk = risk_levels.iter()
        .find(|(l, _)| *l == opp.risk_level)
        .map(|&(_, v)| v)
        .unwrap_or(0.5);

    factors.risk_alignment = 1.0 - (risk_tolerance - opp_risk).abs();

    // Check portfolio fit
    factors.portfolio_fit = calculate_portfolio_fit(opp, portfolio);

    // Timing score (based on deadline and market conditions)
    factors.timing_score = calculate_timing_score(opp);

    // Calculate overall match score
    let match_score = factors.chain_preference * 0.2
        + factors.token_preference * 0.25
        + factors.risk_alignment * 0.25
        + factors.portfolio_fit * 0.2
        + factors.timing_score * 0.1;

    // Determine recommended action
    let recommended_action = generate_recommended_action(opp, portfolio, match_score);

    // Estimate value
    let estimated_value_usd = estimate_value(opp, portfolio);

    Some(MatchedOpportunity {
        opportunity: opp.clone(),
        match_score,
        match_reasons,
        relevance_factors: factors,
        recommended_action,
        estimated_value_usd,
    })
}

/// Calculate how well an opportunity fits the portfolio.
fn calculate_portfolio_fit(opp: &MarketOpportunity, portfolio: &PortfolioContext) -> f64 {
    let mut fit: f64 = 0.0;

    // Check if user has required tokens
    let has_required = opp.requirements.iter().all(|req| {
        portfolio.holdings.iter().any(|h| req.contains(&h.symbol))
    });

    if has_required {
        fit += 0.5;
    }

    // Check value appropriateness
    if let Some(tvl) = opp.tvl_usd {
        // Prefer opportunities with meaningful TVL
        if tvl > 1_000_000.0 {
            fit += 0.3;
        }
    }

    // Bonus for diversification
    let chain_pct = portfolio.chain_distribution.get(&opp.chain).copied().unwrap_or(0.0);
    if chain_pct < 30.0 {
        fit += 0.2; // Bonus for new chain exposure
    }

    fit.min(1.0)
}

/// Calculate timing score.
fn calculate_timing_score(opp: &MarketOpportunity) -> f64 {
    let mut score: f64 = 0.7; // Base score

    // Check deadline
    if let Some(deadline) = opp.deadline {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let time_remaining = deadline - now;

        // Higher score for opportunities expiring soon (urgency)
        if time_remaining < 86400 { // Less than 1 day
            score = 1.0;
        } else if time_remaining < 604800 { // Less than 1 week
            score = 0.9;
        }
    }

    // Higher APY gets slight bonus
    if let Some(apy) = opp.apy {
        if apy > 15.0 {
            score += 0.1;
        }
    }

    score.min(1.0)
}

/// Generate recommended action text.
fn generate_recommended_action(
    opp: &MarketOpportunity,
    _portfolio: &PortfolioContext,
    match_score: f64,
) -> Option<String> {
    if match_score < 0.5 {
        return None;
    }

    let action = match opp.opportunity_type.as_str() {
        "yield_farm" => {
            let default_token = "tokens".to_string();
            let token = opp.tokens.first().unwrap_or(&default_token);
            format!("Consider supplying {} to {} for ~{:.1}% APY",
                token, opp.protocol, opp.apy.unwrap_or(0.0))
        }
        "liquidity_pool" => {
            format!("Consider adding liquidity to {} on {} for ~{:.1}% APY",
                opp.protocol, opp.chain, opp.apy.unwrap_or(0.0))
        }
        "staking" => {
            format!("Consider staking via {} for ~{:.1}% yield",
                opp.protocol, opp.apy.unwrap_or(0.0))
        }
        _ => format!("Review opportunity on {}", opp.protocol),
    };

    Some(action)
}

/// Estimate potential value.
fn estimate_value(opp: &MarketOpportunity, portfolio: &PortfolioContext) -> Option<f64> {
    // Estimate based on portfolio size and APY
    let apy = opp.apy?;
    let suggested_investment = portfolio.total_value_usd * 0.1; // Suggest 10% of portfolio

    Some(suggested_investment * (apy / 100.0))
}

/// Persist a match to database using existing schema.
fn persist_match(matched: &MatchedOpportunity) -> Result<(), String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let record = OpportunityMatchRecord {
        id: uuid::Uuid::new_v4().to_string(),
        opportunity_id: matched.opportunity.id.clone(),
        fit_score: matched.match_score,
        fit_reasons_json: serde_json::to_string(&matched.match_reasons)
            .unwrap_or_else(|_| "[]".to_string()),
        wallet_fit_json: serde_json::to_string(&matched.opportunity)
            .unwrap_or_else(|_| "{}".to_string()),
        guardrail_compatible: true,
        urgency: if matched.match_score > 0.8 { "high" } else { "medium" }.to_string(),
        personal_rank: (matched.match_score * 100.0) as i64,
        first_matched_at: now,
        dismissed_at: None,
    };

    local_db::upsert_opportunity_match(&record)
        .map_err(|e| format!("Failed to persist match: {}", e))
}

/// Get recent matches.
pub fn get_recent_matches(limit: u32) -> Result<Vec<MatchedOpportunity>, String> {
    let records = local_db::get_opportunity_matches(None, limit)
        .map_err(|e| format!("Failed to get matches: {}", e))?;

    Ok(records
        .iter()
        .filter_map(|r| {
            let opportunity: MarketOpportunity = serde_json::from_str(&r.wallet_fit_json).ok()?;
            let match_reasons: Vec<String> = serde_json::from_str(&r.fit_reasons_json)
                .unwrap_or_default();

            Some(MatchedOpportunity {
                opportunity,
                match_score: r.fit_score,
                match_reasons,
                relevance_factors: RelevanceFactors::default(),
                recommended_action: None,
                estimated_value_usd: None,
            })
        })
        .collect())
}

/// Mark an opportunity as dismissed.
#[allow(dead_code)]
pub fn dismiss_opportunity(id: &str) -> Result<(), String> {
    local_db::dismiss_opportunity_match(id)
        .map_err(|e| format!("Failed to dismiss: {}", e))?;
    Ok(())
}

impl std::fmt::Display for OpportunityType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OpportunityType::YieldFarm => write!(f, "yield_farm"),
            OpportunityType::LiquidityPool => write!(f, "liquidity_pool"),
            OpportunityType::Staking => write!(f, "staking"),
            OpportunityType::Swap => write!(f, "swap"),
            OpportunityType::Bridge => write!(f, "bridge"),
            OpportunityType::Airdrop => write!(f, "airdrop"),
            OpportunityType::Governance => write!(f, "governance"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_opportunity_type_display() {
        assert_eq!(OpportunityType::YieldFarm.to_string(), "yield_farm");
        assert_eq!(OpportunityType::LiquidityPool.to_string(), "liquidity_pool");
    }

    #[test]
    fn test_default_scanner_config() {
        let config = ScannerConfig::default();
        assert!(config.min_match_score > 0.0);
        assert!(!config.chains.is_empty());
    }
}
