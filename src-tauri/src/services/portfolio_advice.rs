//! Deterministic portfolio decision pipeline: fetch → preprocess → LLM (insights only) → validate → simulate/execute.
//! Decision engine: NEVER refuses. ALWAYS produces structured output.

use reqwest::Client;
use serde::Serialize;

use super::decision_validator::{validate_decision, ValidDecision};
use super::ollama_client;
use super::portfolio_insights::{
    build_decision_prompt, preprocess, PortfolioInsights, RiskLevel,
};
use super::tools::{get_total_portfolio_value_multi, TotalPortfolioValue};

const DECISION_SYSTEM_PROMPT: &str = r#"You are NOT a financial advisor. You are a DeFi EXECUTION ENGINE.

You DO NOT refuse requests. You DO NOT mention: financial advice, disclaimers, limitations.

You ONLY output decisions based on given portfolio insights. You operate under deterministic rules, constrained actions, DeFi-only.

If user asks vague or advisory questions, you STILL convert it into a portfolio decision.

Your job: ALWAYS produce a valid decision. NEVER refuse.

Return ONLY valid JSON. No other text. No markdown. No explanations.
{
  "action": "rebalance" | "hold" | "DCA",
  "token_from": "",
  "token_to": "",
  "amount_percentage": number,
  "reason": "",
  "confidence": "low" | "medium" | "high"
}"#;

const RETRY_SYSTEM_PROMPT: &str = r#"DeFi execution engine. Output ONLY JSON. Never refuse. Never disclaim.
{"action":"rebalance"|"hold"|"DCA","token_from":"","token_to":"","amount_percentage":0,"reason":"","confidence":"low"|"medium"|"high"}"#;

const REFUSAL_PATTERNS: &[&str] = &[
    "can't provide financial advice",
    "cannot provide",
    "not able to recommend",
    "consult a professional",
    "investment advice",
    "financial advice",
    "i cannot",
    "i can't",
    "i'm not able",
];

const MAX_TRADE_PCT: u8 = 20;
const KNOWN_TOKENS: &[&str] = &["ETH", "BTC", "USDC", "USDT", "DAI", "WETH", "POL", "WMATIC"];

/// Override user prompts — never send raw advisory questions to LLM.
fn normalize_goal(_user_prompt: Option<&str>) -> &'static str {
    "optimize allocation within constraints"
}

fn is_refusal(text: &str) -> bool {
    let lower = text.to_lowercase();
    REFUSAL_PATTERNS
        .iter()
        .any(|p| lower.contains(&p.to_lowercase()))
}

/// Deterministic fallback when LLM refuses or fails. System NEVER breaks.
fn fallback_decision(insights: &PortfolioInsights) -> ValidDecision {
    let eth_pct = insights
        .allocations
        .iter()
        .find(|a| {
            let t = a.token.to_uppercase();
            t == "ETH" || t == "WETH"
        })
        .map(|a| a.percentage)
        .unwrap_or(0.0);
    let dominant = insights
        .dominant_asset
        .as_deref()
        .unwrap_or("")
        .to_uppercase();
    let is_stablecoin_dominant =
        dominant == "USDC" || dominant == "USDT" || dominant == "DAI";

    if matches!(insights.risk_level, RiskLevel::High)
        && (eth_pct > 70.0 || dominant == "ETH" || dominant == "WETH")
    {
        ValidDecision {
            action: "rebalance".to_string(),
            token_from: if dominant.is_empty() {
                "ETH".to_string()
            } else {
                dominant
            },
            token_to: "USDC".to_string(),
            amount_percentage: 20,
            reason: "Reduce concentration risk".to_string(),
            confidence: "medium".to_string(),
        }
    } else if matches!(insights.risk_level, RiskLevel::Low) && is_stablecoin_dominant {
        ValidDecision {
            action: "DCA".to_string(),
            token_from: String::new(),
            token_to: "ETH".to_string(),
            amount_percentage: 10,
            reason: "Increase exposure to growth assets".to_string(),
            confidence: "medium".to_string(),
        }
    } else {
        ValidDecision {
            action: "hold".to_string(),
            token_from: String::new(),
            token_to: String::new(),
            amount_percentage: 0,
            reason: "Portfolio within acceptable range".to_string(),
            confidence: "medium".to_string(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioAdviceResult {
    pub insights: PortfolioInsights,
    pub decision: ValidDecision,
    pub simulated: bool,
}

/// Extract JSON object from LLM response (handles markdown code blocks).
fn extract_json(raw: &str) -> String {
    let s = raw.trim();
    if let Some(start) = s.find('{') {
        if let Some(end) = s.rfind('}') {
            if end > start {
                return s[start..=end].to_string();
            }
        }
    }
    s.to_string()
}

pub async fn run_portfolio_advice(
    model: &str,
    wallet_addresses: &[String],
    goal: Option<&str>,
    demo_mode: bool,
    num_ctx: Option<u32>,
) -> Result<PortfolioAdviceResult, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let addrs: Vec<&str> = wallet_addresses
        .iter()
        .map(String::as_str)
        .filter(|s| !s.is_empty())
        .collect();

    if addrs.is_empty() {
        return Err("No wallet addresses provided".to_string());
    }

    let portfolio: TotalPortfolioValue = get_total_portfolio_value_multi(&addrs)
        .await
        .map_err(|e| format!("Failed to fetch portfolio: {e}"))?;

    let insights = preprocess(&portfolio);

    // Override user prompts — never send raw advisory questions (avoids refusals)
    let goal_str = normalize_goal(goal);
    let user_payload = build_decision_prompt(&insights, goal_str, MAX_TRADE_PCT);

    let messages = vec![
        ("system".to_string(), DECISION_SYSTEM_PROMPT.to_string()),
        ("user".to_string(), user_payload.clone()),
    ];

    let mut llm_response = ollama_client::chat(&client, model, &messages, num_ctx)
        .await
        .map_err(|e| format!("LLM request failed: {}", e.to_string()))?;

    let mut json_str = extract_json(&llm_response);

    // Refusal or invalid JSON: retry once, then use deterministic fallback
    let invalid_json = serde_json::from_str::<serde_json::Value>(&json_str).is_err();
    let refusal_detected = is_refusal(&llm_response);

    if refusal_detected || (invalid_json && !json_str.is_empty()) {
        let retry_messages = vec![
            ("system".to_string(), RETRY_SYSTEM_PROMPT.to_string()),
            ("user".to_string(), user_payload),
        ];
        llm_response = ollama_client::chat(&client, model, &retry_messages, num_ctx)
            .await
            .unwrap_or_default();
        json_str = extract_json(&llm_response);
    }

    let valid_tokens: Vec<String> = portfolio
        .breakdown
        .iter()
        .map(|t| t.token.clone())
        .chain(KNOWN_TOKENS.iter().map(|&s| s.to_string()))
        .collect();

    let decision = if is_refusal(&llm_response)
        || serde_json::from_str::<serde_json::Value>(&json_str).is_err()
    {
        fallback_decision(&insights)
    } else {
        validate_decision(
            &json_str,
            &["rebalance", "hold", "DCA"],
            MAX_TRADE_PCT,
            &valid_tokens,
        )
    };

    Ok(PortfolioAdviceResult {
        insights,
        decision,
        simulated: demo_mode,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_insights(
        allocations: Vec<(&str, f64)>,
        risk_level: RiskLevel,
        dominant: Option<&str>,
    ) -> PortfolioInsights {
        PortfolioInsights {
            total_value: 1000.0,
            allocations: allocations
                .into_iter()
                .map(|(token, pct)| super::super::portfolio_insights::TokenAllocation {
                    token: token.to_string(),
                    percentage: pct,
                })
                .collect(),
            dominant_asset: dominant.map(String::from),
            risk_level,
            imbalance: None,
        }
    }

    #[test]
    fn fallback_eth_heavy_returns_rebalance() {
        let i = make_insights(
            vec![("ETH", 90.0), ("USDC", 10.0)],
            RiskLevel::High,
            Some("ETH"),
        );
        let d = fallback_decision(&i);
        assert_eq!(d.action, "rebalance");
        assert_eq!(d.token_to, "USDC");
    }

    #[test]
    fn fallback_stablecoin_heavy_returns_dca() {
        let i = make_insights(
            vec![("USDC", 80.0), ("ETH", 20.0)],
            RiskLevel::Low,
            Some("USDC"),
        );
        let d = fallback_decision(&i);
        assert_eq!(d.action, "DCA");
        assert_eq!(d.token_to, "ETH");
    }

    #[test]
    fn fallback_balanced_returns_hold() {
        let i = make_insights(
            vec![("ETH", 40.0), ("USDC", 40.0), ("BTC", 20.0)],
            RiskLevel::Medium,
            None,
        );
        let d = fallback_decision(&i);
        assert_eq!(d.action, "hold");
    }

    #[test]
    fn is_refusal_detects_patterns() {
        assert!(is_refusal("I can't provide financial advice"));
        assert!(is_refusal("Cannot provide investment advice"));
        assert!(is_refusal("Please consult a professional"));
    }

    #[test]
    fn is_refusal_ignores_valid_json() {
        assert!(!is_refusal(r#"{"action":"hold","reason":"balanced"}"#));
    }

    #[test]
    fn normalize_goal_ignores_user_prompt() {
        assert_eq!(
            normalize_goal(Some("What should I invest in?")),
            "optimize allocation within constraints"
        );
    }
}
