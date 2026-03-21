//! Logic for autonomous strategy creation and drift calculation.

use serde::{Deserialize, Serialize};
use crate::services::local_db;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyProposal {
    pub name: String,
    pub summary: String,
    pub trigger: serde_json::Value,
    pub action: serde_json::Value,
    pub guardrails: serde_json::Value,
}

pub fn prepare_strategy_proposal(
    name: String,
    summary: String,
    trigger: serde_json::Value,
    action: serde_json::Value,
    guardrails: serde_json::Value,
) -> Result<StrategyProposal, String> {
    // In a real app, we might validate the config here.
    Ok(StrategyProposal {
        name,
        summary,
        trigger,
        action,
        guardrails,
    })
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriftReport {
    pub assets: Vec<AssetDrift>,
    pub total_drift_score: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetDrift {
    pub symbol: String,
    pub current_percentage: f64,
    pub target_percentage: f64,
    pub drift: f64,
}

pub async fn calculate_drift(
    target_allocations: Vec<local_db::TargetAllocation>,
    wallet_addresses: &[String],
) -> Result<DriftReport, String> {
    let portfolio = super::portfolio_tools::get_total_portfolio_value_multi(
        &wallet_addresses.iter().map(|s| s.as_str()).collect::<Vec<_>>()
    ).await.map_err(|e| e.to_string())?;

    let total_value: f64 = portfolio.total_usd.replace('$', "").replace(',', "").parse().unwrap_or(0.0);
    if total_value == 0.0 {
        return Ok(DriftReport { assets: vec![], total_drift_score: 0.0 });
    }

    let mut report = DriftReport { assets: vec![], total_drift_score: 0.0 };
    let mut total_drift = 0.0;

    for target in target_allocations {
        let current_asset = portfolio.breakdown.iter().find(|b| b.token == target.symbol);
        let current_val: f64 = current_asset.map(|a| a.value.replace('$', "").replace(',', "").parse().unwrap_or(0.0)).unwrap_or(0.0);
        let current_pct = (current_val / total_value) * 100.0;
        let drift = current_pct - target.percentage;
        
        total_drift += drift.abs();
        report.assets.push(AssetDrift {
            symbol: target.symbol,
            current_percentage: current_pct,
            target_percentage: target.percentage,
            drift,
        });
    }

    report.total_drift_score = total_drift;
    Ok(report)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmergencyRoute {
    pub total_value_at_risk: String,
    pub routes: Vec<ExitPath>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExitPath {
    pub from_token: String,
    pub to_token: String,
    pub chain: String,
    pub amount: String,
    pub estimated_gas_usd: String,
}

pub async fn build_panic_routes(
    assets: Vec<String>,
    destination: String,
    _wallet_addresses: &[String],
) -> Result<EmergencyRoute, String> {
    // Placeholder: In real implementation, this would call DEX aggregators.
    let mut report = EmergencyRoute {
        total_value_at_risk: "$0.00".to_string(),
        routes: vec![],
    };

    for asset in assets {
        report.routes.push(ExitPath {
            from_token: asset,
            to_token: destination.clone(),
            chain: "Base".to_string(), // Mock
            amount: "ALL".to_string(),
            estimated_gas_usd: "$1.50".to_string(),
        });
    }

    Ok(report)
}
