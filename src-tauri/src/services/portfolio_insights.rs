//! Deterministic preprocessing of portfolio data into structured insights.
//! No AI; used as input to the LLM decision layer.

use serde::Serialize;

use super::tools::{TokenValueItem, TotalPortfolioValue};

const STABLECOINS: &[&str] = &["USDC", "USDT", "DAI", "USDC.e", "BUSD", "FRAX", "TUSD"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenAllocation {
    pub token: String,
    pub percentage: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioInsights {
    pub total_value: f64,
    pub allocations: Vec<TokenAllocation>,
    pub dominant_asset: Option<String>,
    pub risk_level: RiskLevel,
    pub imbalance: Option<String>,
}

fn parse_usd(s: &str) -> f64 {
    s.trim()
        .trim_start_matches('$')
        .replace(',', "")
        .parse()
        .unwrap_or(0.0)
}

fn is_stablecoin(symbol: &str) -> bool {
    let upper = symbol.to_uppercase();
    STABLECOINS.iter().any(|s| upper == *s || upper.starts_with(&s.to_uppercase()))
}

/// Deterministic preprocessing: raw portfolio → structured insights.
pub fn preprocess(portfolio: &TotalPortfolioValue) -> PortfolioInsights {
    let total_value = parse_usd(&portfolio.total_usd);

    let breakdown: Vec<(&TokenValueItem, f64)> = portfolio
        .breakdown
        .iter()
        .map(|item| {
            let v = parse_usd(&item.value);
            (item, v)
        })
        .collect();

    let allocations: Vec<TokenAllocation> = if total_value > 0.0 {
        breakdown
            .iter()
            .map(|(item, v)| TokenAllocation {
                token: item.token.clone(),
                percentage: (v / total_value) * 100.0,
            })
            .collect()
    } else {
        Vec::new()
    };

    let dominant_asset = allocations
        .iter()
        .find(|a| a.percentage > 50.0)
        .map(|a| a.token.clone());

    let token_count = allocations.len().max(1);
    let equal_share = 100.0 / token_count as f64;
    let imbalance = allocations
        .iter()
        .find(|a| a.percentage > equal_share + 20.0)
        .map(|a| format!("{} overweight by {:.0}%", a.token, a.percentage - equal_share));

    let volatile_pct: f64 = breakdown
        .iter()
        .filter(|(item, _)| !is_stablecoin(&item.token))
        .map(|(_, v)| v)
        .sum::<f64>()
        / total_value.max(0.0001)
        * 100.0;

    let risk_level = if volatile_pct > 60.0 {
        RiskLevel::High
    } else if volatile_pct < 30.0 {
        RiskLevel::Low
    } else {
        RiskLevel::Medium
    };

    PortfolioInsights {
        total_value,
        allocations,
        dominant_asset,
        risk_level,
        imbalance,
    }
}

/// Build the user message payload for the LLM (insights + constraints only, no raw JSON).
pub fn build_decision_prompt(
    insights: &PortfolioInsights,
    goal: &str,
    max_trade_pct: u8,
) -> String {
    let alloc_str: String = insights
        .allocations
        .iter()
        .map(|a| format!("{}: {:.1}%", a.token, a.percentage))
        .collect::<Vec<_>>()
        .join(", ");

    let risk_str = match insights.risk_level {
        RiskLevel::Low => "low",
        RiskLevel::Medium => "medium",
        RiskLevel::High => "high",
    };

    let dominant = insights
        .dominant_asset
        .as_deref()
        .unwrap_or("none");
    let imbalance = insights
        .imbalance
        .as_deref()
        .unwrap_or("balanced");

    format!(
        r#"{{
  "goal": "{}",
  "insights": {{
    "dominantAsset": "{}",
    "allocations": "{}",
    "riskLevel": "{}",
    "imbalance": "{}",
    "totalValueUsd": {:.2}
  }},
  "constraints": {{
    "maxTrade": {},
    "allowedActions": ["rebalance", "hold", "DCA"]
  }}
}}"#,
        goal,
        dominant,
        alloc_str,
        risk_str,
        imbalance,
        insights.total_value,
        max_trade_pct,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_portfolio(breakdown: Vec<(&str, &str)>, total_usd: &str) -> TotalPortfolioValue {
        use super::super::tools::TokenValueItem;
        TotalPortfolioValue {
            total_usd: total_usd.to_string(),
            breakdown: breakdown
                .into_iter()
                .map(|(token, value)| TokenValueItem {
                    token: token.to_string(),
                    amount: "0".to_string(),
                    value: value.to_string(),
                    chains: None,
                    holdings: vec![],
                })
                .collect(),
            wallet_count: 1,
        }
    }

    #[test]
    fn preprocess_computes_allocations() {
        let p = make_portfolio(
            vec![("ETH", "$700"), ("USDC", "$300")],
            "$1000",
        );
        let i = preprocess(&p);
        assert!((i.total_value - 1000.0).abs() < 0.01);
        assert_eq!(i.allocations.len(), 2);
        let eth = i.allocations.iter().find(|a| a.token == "ETH").unwrap();
        assert!((eth.percentage - 70.0).abs() < 0.1);
    }

    #[test]
    fn preprocess_detects_dominant_asset() {
        let p = make_portfolio(
            vec![("ETH", "$700"), ("USDC", "$300")],
            "$1000",
        );
        let i = preprocess(&p);
        assert_eq!(i.dominant_asset.as_deref(), Some("ETH"));
    }

    #[test]
    fn preprocess_detects_risk_level() {
        let p_high = make_portfolio(
            vec![("ETH", "$700"), ("BTC", "$100")],
            "$800",
        );
        let i_high = preprocess(&p_high);
        assert_eq!(i_high.risk_level, RiskLevel::High);

        let p_low = make_portfolio(
            vec![("USDC", "$800"), ("USDT", "$200")],
            "$1000",
        );
        let i_low = preprocess(&p_low);
        assert_eq!(i_low.risk_level, RiskLevel::Low);
    }

    #[test]
    fn preprocess_empty_portfolio() {
        let p = make_portfolio(vec![], "$0");
        let i = preprocess(&p);
        assert_eq!(i.total_value, 0.0);
        assert!(i.allocations.is_empty());
        assert!(i.dominant_asset.is_none());
        assert_eq!(i.risk_level, RiskLevel::Low);
    }

    /// Scenario 1: ETH heavy (90% ETH, 10% USDC) → high risk, dominant ETH
    #[test]
    fn scenario_eth_heavy_portfolio() {
        let p = make_portfolio(
            vec![("ETH", "$900"), ("USDC", "$100")],
            "$1000",
        );
        let i = preprocess(&p);
        assert_eq!(i.risk_level, RiskLevel::High);
        assert_eq!(i.dominant_asset.as_deref(), Some("ETH"));
        assert!(i.imbalance.is_some());
    }

    /// Scenario 2: Balanced (40% ETH, 40% USDC, 20% BTC) → medium risk
    #[test]
    fn scenario_balanced_portfolio() {
        let p = make_portfolio(
            vec![("ETH", "$400"), ("USDC", "$400"), ("BTC", "$200")],
            "$1000",
        );
        let i = preprocess(&p);
        assert_eq!(i.risk_level, RiskLevel::Medium);
        assert!(i.dominant_asset.is_none()); // nothing >50%
    }

    /// Scenario 3: Stablecoin heavy (80% USDC, 20% ETH) → low risk
    #[test]
    fn scenario_stablecoin_heavy_portfolio() {
        let p = make_portfolio(
            vec![("USDC", "$800"), ("ETH", "$200")],
            "$1000",
        );
        let i = preprocess(&p);
        assert_eq!(i.risk_level, RiskLevel::Low);
        assert_eq!(i.dominant_asset.as_deref(), Some("USDC"));
    }
}
