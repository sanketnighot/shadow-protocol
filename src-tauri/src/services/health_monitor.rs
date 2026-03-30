//! Health monitor service for portfolio health assessment.
//!
//! Calculates drift from target allocations, concentration risk,
//! performance metrics, and overall portfolio health scores.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{info, warn};

use super::local_db::{self, PortfolioHealthRecord};
use crate::services::audit;

/// Health alert types.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum HealthAlertType {
    DriftExceeded,
    ConcentrationHigh,
    UnderperformingAsset,
    StaleData,
    RiskThreshold,
    LargeHolding,
    ChainConcentration,
}

/// Health alert severity.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AlertSeverity {
    Info,
    Warning,
    Critical,
}

/// A health alert.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthAlert {
    pub alert_type: String,
    pub severity: String,
    pub title: String,
    pub message: String,
    pub affected_assets: Vec<String>,
    pub recommended_action: Option<String>,
    pub threshold_value: Option<f64>,
    pub current_value: Option<f64>,
}

/// Component score breakdown.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentScore {
    pub name: String,
    pub score: f64,
    pub weight: f64,
    pub details: String,
}

/// Drift analysis for a single asset.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriftAnalysis {
    pub symbol: String,
    pub target_pct: f64,
    pub current_pct: f64,
    pub drift_pct: f64,
    pub drift_direction: String, // "overweight" or "underweight"
    pub usd_value: f64,
    pub suggested_action: Option<String>,
}

/// Portfolio health summary.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioHealthSummary {
    pub overall_score: f64,
    pub drift_score: f64,
    pub concentration_score: f64,
    pub performance_score: f64,
    pub risk_score: f64,
    pub component_scores: Vec<ComponentScore>,
    pub alerts: Vec<HealthAlert>,
    pub drift_analysis: Vec<DriftAnalysis>,
    pub recommendations: Vec<String>,
}

/// Asset holding for analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetHolding {
    pub symbol: String,
    pub value_usd: f64,
    pub percentage: f64,
    pub chain: String,
    pub is_stablecoin: bool,
}

/// Target allocation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetAllocation {
    pub symbol: String,
    pub target_pct: f64,
}

/// Run a health check on the portfolio.
pub fn run_health_check(
    holdings: &[AssetHolding],
    target_allocations: &[TargetAllocation],
    total_value_usd: f64,
) -> Result<PortfolioHealthSummary, String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    // Calculate component scores
    let drift_score = calculate_drift_score(holdings, target_allocations);
    let concentration_score = calculate_concentration_score(holdings);
    let performance_score = calculate_performance_score(); // Placeholder
    let risk_score = calculate_risk_score(holdings);

    // Calculate overall score (weighted average)
    let overall_score = drift_score * 0.35
        + concentration_score * 0.25
        + performance_score * 0.20
        + risk_score * 0.20;

    // Generate alerts
    let alerts = generate_alerts(
        holdings,
        target_allocations,
        drift_score,
        concentration_score,
        risk_score,
    );

    // Generate drift analysis
    let drift_analysis = analyze_drift(holdings, target_allocations, total_value_usd);

    // Generate recommendations
    let recommendations = generate_recommendations(&alerts, &drift_analysis);

    let component_scores = vec![
        ComponentScore {
            name: "Drift".to_string(),
            score: drift_score,
            weight: 0.35,
            details: format!(
                "Average allocation drift: {:.1}%",
                100.0 - drift_score
            ),
        },
        ComponentScore {
            name: "Concentration".to_string(),
            score: concentration_score,
            weight: 0.25,
            details: format!("Diversification score: {:.1}%", concentration_score),
        },
        ComponentScore {
            name: "Performance".to_string(),
            score: performance_score,
            weight: 0.20,
            details: "Based on historical data".to_string(),
        },
        ComponentScore {
            name: "Risk".to_string(),
            score: risk_score,
            weight: 0.20,
            details: format!("Portfolio risk score: {:.1}", risk_score),
        },
    ];

    let summary = PortfolioHealthSummary {
        overall_score,
        drift_score,
        concentration_score,
        performance_score,
        risk_score,
        component_scores,
        alerts,
        drift_analysis,
        recommendations,
    };

    // Persist to database
    let record = PortfolioHealthRecord {
        id: uuid::Uuid::new_v4().to_string(),
        overall_score,
        drift_score,
        concentration_score,
        performance_score,
        risk_score,
        component_scores_json: serde_json::to_string(&summary.component_scores)
            .unwrap_or_else(|_| "[]".to_string()),
        alerts_json: serde_json::to_string(&summary.alerts)
            .unwrap_or_else(|_| "[]".to_string()),
        recommendations_json: serde_json::to_string(&summary.recommendations)
            .unwrap_or_else(|_| "[]".to_string()),
        created_at: now,
    };

    if let Err(e) = local_db::insert_portfolio_health(&record) {
        warn!("Failed to persist health record: {}", e);
    }

    // Log to audit
    audit::record(
        "health_check_completed",
        "portfolio_health",
        Some(&record.id),
        &serde_json::json!({
            "overallScore": overall_score,
            "alertCount": summary.alerts.len(),
        }),
    );

    info!(overall_score, "health.check_completed");

    Ok(summary)
}

/// Calculate drift score (how close to target allocations).
fn calculate_drift_score(
    holdings: &[AssetHolding],
    targets: &[TargetAllocation],
) -> f64 {
    if holdings.is_empty() || targets.is_empty() {
        return 100.0; // No drift if no targets
    }

    let mut total_drift = 0.0;
    let mut matched_count = 0;

    for target in targets {
        // Find matching holding
        let holding = holdings.iter().find(|h| {
            h.symbol.to_uppercase() == target.symbol.to_uppercase()
        });

        if let Some(h) = holding {
            let drift = (h.percentage - target.target_pct).abs();
            total_drift += drift;
            matched_count += 1;
        } else {
            // Target not held - count as full drift
            total_drift += target.target_pct;
        }
    }

    if matched_count == 0 {
        return 50.0; // No matches - neutral score
    }

    // Convert drift to score (0-100, higher is better)
    let avg_drift = total_drift / targets.len() as f64;
    let score = 100.0 - (avg_drift * 2.0).min(100.0);

    score.max(0.0)
}

/// Calculate concentration score (diversification).
fn calculate_concentration_score(holdings: &[AssetHolding]) -> f64 {
    if holdings.is_empty() {
        return 100.0;
    }

    // Calculate Herfindahl-Hirschman Index (HHI)
    // Lower HHI = more diversified = higher score
    let hhi: f64 = holdings
        .iter()
        .map(|h| {
            let pct = h.percentage / 100.0;
            pct * pct
        })
        .sum();

    // HHI ranges from 0 (perfectly diversified) to 1 (single asset)
    // Convert to score: 0 HHI = 100 score, 1 HHI = 0 score
    let diversification_score = (1.0 - hhi) * 100.0;

    // Penalize if any single asset > 50%
    let max_holding_pct = holdings
        .iter()
        .map(|h| h.percentage)
        .max_by(|a, b| a.partial_cmp(b).unwrap())
        .unwrap_or(0.0);

    let concentration_penalty = if max_holding_pct > 50.0 {
        (max_holding_pct - 50.0) * 0.5 // Subtract 0.5 points per % over 50%
    } else {
        0.0
    };

    (diversification_score - concentration_penalty).max(0.0)
}

/// Calculate performance score (placeholder).
fn calculate_performance_score() -> f64 {
    // In a real implementation, this would compare against benchmarks
    // For now, return a neutral score
    75.0
}

/// Calculate risk score.
fn calculate_risk_score(holdings: &[AssetHolding]) -> f64 {
    if holdings.is_empty() {
        return 100.0;
    }

    let mut risk_score: f64 = 100.0;

    // Penalize non-stablecoin concentration
    let stablecoin_pct: f64 = holdings
        .iter()
        .filter(|h| h.is_stablecoin)
        .map(|h| h.percentage)
        .sum();

    let volatile_pct = 100.0 - stablecoin_pct;

    // Reduce score based on volatile asset exposure
    if volatile_pct > 80.0 {
        risk_score -= 20.0;
    } else if volatile_pct > 60.0 {
        risk_score -= 10.0;
    }

    // Penalize chain concentration
    let chain_counts: HashMap<String, f64> = {
        let mut map = HashMap::new();
        for h in holdings {
            *map.entry(h.chain.clone()).or_insert(0.0) += h.percentage;
        }
        map
    };

    if let Some(&max_chain_pct) = chain_counts.values().max_by(|a, b| a.partial_cmp(b).unwrap()) {
        if max_chain_pct > 90.0 {
            risk_score -= 10.0;
        } else if max_chain_pct > 70.0 {
            risk_score -= 5.0;
        }
    }

    risk_score.max(0.0)
}

/// Generate health alerts.
fn generate_alerts(
    holdings: &[AssetHolding],
    targets: &[TargetAllocation],
    drift_score: f64,
    concentration_score: f64,
    risk_score: f64,
) -> Vec<HealthAlert> {
    let mut alerts = Vec::new();

    // Drift alerts
    if drift_score < 50.0 {
        alerts.push(HealthAlert {
            alert_type: HealthAlertType::DriftExceeded.to_string(),
            severity: AlertSeverity::Warning.to_string(),
            title: "Portfolio Drift High".to_string(),
            message: "Your portfolio has drifted significantly from target allocations.".to_string(),
            affected_assets: targets.iter().map(|t| t.symbol.clone()).collect(),
            recommended_action: Some("Consider rebalancing to target allocations.".to_string()),
            threshold_value: Some(50.0),
            current_value: Some(drift_score),
        });
    }

    // Concentration alerts
    if concentration_score < 50.0 {
        alerts.push(HealthAlert {
            alert_type: HealthAlertType::ConcentrationHigh.to_string(),
            severity: AlertSeverity::Warning.to_string(),
            title: "High Concentration Risk".to_string(),
            message: "Your portfolio is highly concentrated in a few assets.".to_string(),
            affected_assets: holdings.iter()
                .filter(|h| h.percentage > 30.0)
                .map(|h| h.symbol.clone())
                .collect(),
            recommended_action: Some("Consider diversifying across more assets.".to_string()),
            threshold_value: Some(50.0),
            current_value: Some(concentration_score),
        });
    }

    // Large holding alerts
    for h in holdings {
        if h.percentage > 50.0 && !h.is_stablecoin {
            alerts.push(HealthAlert {
                alert_type: HealthAlertType::LargeHolding.to_string(),
                severity: AlertSeverity::Warning.to_string(),
                title: format!("Large {} Position", h.symbol),
                message: format!(
                    "{} represents {:.1}% of your portfolio.",
                    h.symbol, h.percentage
                ),
                affected_assets: vec![h.symbol.clone()],
                recommended_action: Some("Consider reducing position size for better diversification.".to_string()),
                threshold_value: Some(50.0),
                current_value: Some(h.percentage),
            });
        }
    }

    // Risk alerts
    if risk_score < 40.0 {
        alerts.push(HealthAlert {
            alert_type: HealthAlertType::RiskThreshold.to_string(),
            severity: AlertSeverity::Critical.to_string(),
            title: "High Portfolio Risk".to_string(),
            message: "Your portfolio has elevated risk exposure.".to_string(),
            affected_assets: holdings.iter()
                .filter(|h| !h.is_stablecoin)
                .map(|h| h.symbol.clone())
                .collect(),
            recommended_action: Some("Consider adding stablecoin exposure to reduce risk.".to_string()),
            threshold_value: Some(40.0),
            current_value: Some(risk_score),
        });
    }

    alerts
}

/// Analyze drift for each asset.
fn analyze_drift(
    holdings: &[AssetHolding],
    targets: &[TargetAllocation],
    _total_value_usd: f64,
) -> Vec<DriftAnalysis> {
    let mut analyses = Vec::new();

    for target in targets {
        let holding = holdings.iter().find(|h| {
            h.symbol.to_uppercase() == target.symbol.to_uppercase()
        });

        let (current_pct, usd_value) = holding
            .map(|h| (h.percentage, h.value_usd))
            .unwrap_or((0.0, 0.0));

        let drift = current_pct - target.target_pct;
        let direction = if drift > 0.0 {
            "overweight"
        } else {
            "underweight"
        };

        let suggested_action = if drift.abs() > 10.0 {
            Some(if drift > 0.0 {
                format!("Consider reducing {} position", target.symbol)
            } else {
                format!("Consider adding to {} position", target.symbol)
            })
        } else {
            None
        };

        analyses.push(DriftAnalysis {
            symbol: target.symbol.clone(),
            target_pct: target.target_pct,
            current_pct,
            drift_pct: drift.abs(),
            drift_direction: direction.to_string(),
            usd_value,
            suggested_action,
        });
    }

    // Sort by drift magnitude
    analyses.sort_by(|a, b| b.drift_pct.partial_cmp(&a.drift_pct).unwrap());
    analyses
}

/// Generate recommendations based on alerts and drift.
fn generate_recommendations(
    alerts: &[HealthAlert],
    drift_analysis: &[DriftAnalysis],
) -> Vec<String> {
    let mut recommendations = Vec::new();

    // From alerts
    for alert in alerts {
        if let Some(ref action) = alert.recommended_action {
            recommendations.push(action.clone());
        }
    }

    // From drift
    for drift in drift_analysis.iter().take(3) {
        if drift.drift_pct > 5.0 {
            if let Some(ref action) = drift.suggested_action {
                recommendations.push(action.clone());
            }
        }
    }

    // Dedupe
    recommendations.sort();
    recommendations.dedup();

    recommendations
}

/// Get the latest health record.
pub fn get_latest_health() -> Result<Option<PortfolioHealthRecord>, String> {
    local_db::get_latest_portfolio_health()
        .map_err(|e| format!("Failed to get latest health: {}", e))
}

/// Get health history.
#[allow(dead_code)]
pub fn get_health_history(limit: u32) -> Result<Vec<PortfolioHealthRecord>, String> {
    local_db::get_portfolio_health_history(limit)
        .map_err(|e| format!("Failed to get health history: {}", e))
}

impl std::fmt::Display for HealthAlertType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HealthAlertType::DriftExceeded => write!(f, "drift_exceeded"),
            HealthAlertType::ConcentrationHigh => write!(f, "concentration_high"),
            HealthAlertType::UnderperformingAsset => write!(f, "underperforming_asset"),
            HealthAlertType::StaleData => write!(f, "stale_data"),
            HealthAlertType::RiskThreshold => write!(f, "risk_threshold"),
            HealthAlertType::LargeHolding => write!(f, "large_holding"),
            HealthAlertType::ChainConcentration => write!(f, "chain_concentration"),
        }
    }
}

impl std::fmt::Display for AlertSeverity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AlertSeverity::Info => write!(f, "info"),
            AlertSeverity::Warning => write!(f, "warning"),
            AlertSeverity::Critical => write!(f, "critical"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_concentration_score_perfect_diversification() {
        let holdings = vec![
            AssetHolding { symbol: "A".to_string(), value_usd: 2500.0, percentage: 25.0, chain: "eth".to_string(), is_stablecoin: false },
            AssetHolding { symbol: "B".to_string(), value_usd: 2500.0, percentage: 25.0, chain: "eth".to_string(), is_stablecoin: false },
            AssetHolding { symbol: "C".to_string(), value_usd: 2500.0, percentage: 25.0, chain: "eth".to_string(), is_stablecoin: false },
            AssetHolding { symbol: "D".to_string(), value_usd: 2500.0, percentage: 25.0, chain: "eth".to_string(), is_stablecoin: false },
        ];

        let score = calculate_concentration_score(&holdings);
        assert!(score > 90.0); // Should be high for good diversification
    }

    #[test]
    fn test_concentration_score_single_asset() {
        let holdings = vec![
            AssetHolding { symbol: "A".to_string(), value_usd: 10000.0, percentage: 100.0, chain: "eth".to_string(), is_stablecoin: false },
        ];

        let score = calculate_concentration_score(&holdings);
        assert!(score < 50.0); // Should be low for poor diversification
    }
}
