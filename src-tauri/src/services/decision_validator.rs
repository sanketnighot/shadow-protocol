//! Normalizes and validates LLM decision output. Soft validation: fix/clamp instead of reject.

use serde::{Deserialize, Serialize};

const DEFAULT_STABLECOIN: &str = "USDC";
const STABLECOINS: &[&str] = &["USDC", "USDT", "DAI", "USDC.E", "BUSD", "FRAX"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidDecision {
    pub action: String,
    pub token_from: String,
    pub token_to: String,
    pub amount_percentage: u8,
    pub reason: String,
    pub confidence: String,
}

/// Fallback when we cannot produce a valid decision. Never shows "Validation failed" in UI.
fn default_hold() -> ValidDecision {
    ValidDecision {
        action: "hold".to_string(),
        token_from: String::new(),
        token_to: String::new(),
        amount_percentage: 0,
        reason: "No safe action within constraints".to_string(),
        confidence: "low".to_string(),
    }
}

fn is_allowed_action(action: &str, allowed: &[&str]) -> bool {
    let a = action.trim().to_lowercase();
    allowed
        .iter()
        .any(|s| a == s.to_lowercase())
}

/// Map synonyms or malformed action strings to canonical action.
fn normalize_action(raw: &str) -> Option<String> {
    let lower = raw.trim().to_lowercase();
    if lower.contains("rebalance") || lower.contains("swap") || lower == "rebalance portfolio" {
        return Some("rebalance".to_string());
    }
    if lower.contains("dca") || lower.contains("dollar cost") || lower.contains("average") {
        return Some("DCA".to_string());
    }
    if lower == "hold" || lower.contains("hold") || lower == "maintain" || lower.is_empty() {
        return Some("hold".to_string());
    }
    if lower == "rebalance" {
        return Some("rebalance".to_string());
    }
    if lower == "dca" {
        return Some("DCA".to_string());
    }
    None
}

/// Normalize token: uppercase, ensure in valid set or fallback to stablecoin.
fn normalize_token(token: &str, valid_tokens: &[String], fallback_to_stable: bool) -> String {
    let t = token.trim();
    if t.is_empty() {
        return if fallback_to_stable {
            DEFAULT_STABLECOIN.to_string()
        } else {
            String::new()
        };
    }
    let upper = t.to_uppercase();
    let in_portfolio = valid_tokens.iter().any(|v| v.to_uppercase() == upper);
    if in_portfolio {
        return upper;
    }
    let in_known = STABLECOINS.iter().any(|&s| upper == s || upper.starts_with(s))
        || ["ETH", "BTC", "WETH", "WBTC", "POL", "WMATIC"].contains(&upper.as_str());
    if in_known {
        return upper;
    }
    if fallback_to_stable {
        DEFAULT_STABLECOIN.to_string()
    } else {
        upper
    }
}

/// Normalize raw LLM output into a consistent structure before validation.
fn normalize_decision(
    raw: &str,
    valid_tokens: &[String],
    max_trade_pct: u8,
) -> Option<(String, String, String, u8, String, String)> {
    #[derive(Deserialize)]
    struct RawDecision {
        action: Option<String>,
        token_from: Option<String>,
        token_to: Option<String>,
        amount_percentage: Option<f64>,
        reason: Option<String>,
        confidence: Option<String>,
    }

    let parsed: RawDecision = serde_json::from_str(raw).ok()?;

    let action_raw = parsed.action.unwrap_or_else(|| "hold".to_string());
    let action = normalize_action(&action_raw).unwrap_or_else(|| {
        let a = action_raw.trim().to_lowercase();
        if a == "dca" {
            "DCA".to_string()
        } else if is_allowed_action(&a, &["rebalance", "hold", "DCA"]) {
            a
        } else {
            "hold".to_string()
        }
    });

    let amount_pct = parsed
        .amount_percentage
        .map(|v| v.clamp(0.0, max_trade_pct as f64) as u8)
        .unwrap_or(0);

    let need_from = action.eq_ignore_ascii_case("rebalance");
    let need_to = action.eq_ignore_ascii_case("rebalance") || action.eq_ignore_ascii_case("dca");

    let token_from = normalize_token(
        &parsed.token_from.unwrap_or_default(),
        valid_tokens,
        false,
    );
    let token_to = normalize_token(
        &parsed.token_to.unwrap_or_default(),
        valid_tokens,
        need_to,
    );

    let reason = parsed
        .reason
        .unwrap_or_else(|| "Portfolio analysis complete".to_string())
        .trim()
        .to_string();
    let confidence_raw = parsed.confidence.unwrap_or_else(|| "low".to_string());
    let confidence = ["low", "medium", "high"]
        .contains(&confidence_raw.to_lowercase().as_str())
        .then(|| confidence_raw)
        .unwrap_or_else(|| "low".to_string());

    Some((
        action,
        if need_from && token_from.is_empty() {
            valid_tokens.first().cloned().unwrap_or_else(|| "ETH".to_string())
        } else {
            token_from
        },
        token_to,
        amount_pct,
        reason,
        confidence,
    ))
}

/// Soft validation: parse, normalize, clamp. Never reject; always produce valid output.
pub fn validate_decision(
    raw: &str,
    allowed_actions: &[&str],
    max_trade_pct: u8,
    valid_tokens: &[String],
) -> ValidDecision {
    let json_str = raw.trim();
    if json_str.is_empty() {
        return default_hold();
    }

    if let Some((action, token_from, token_to, amount_pct, reason, confidence)) =
        normalize_decision(json_str, valid_tokens, max_trade_pct)
    {
        let action = if is_allowed_action(&action, allowed_actions) {
            action
        } else {
            "hold".to_string()
        };
        return ValidDecision {
            action: action.clone(),
            token_from: token_from.clone(),
            token_to: token_to.clone(),
            amount_percentage: amount_pct.min(max_trade_pct),
            reason,
            confidence,
        };
    }

    default_hold()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_json_returns_hold_with_friendly_reason() {
        let d = validate_decision("not json", &["hold", "rebalance", "DCA"], 20, &[]);
        assert_eq!(d.action, "hold");
        assert!(!d.reason.to_lowercase().contains("validation failed"));
    }

    #[test]
    fn swap_synonym_maps_to_rebalance() {
        let d = validate_decision(
            r#"{"action":"swap","reason":"x"}"#,
            &["hold", "rebalance", "DCA"],
            20,
            &["ETH".into(), "USDC".into()],
        );
        assert_eq!(d.action, "rebalance");
    }

    #[test]
    fn valid_hold_passes() {
        let d = validate_decision(
            r#"{"action":"hold","reason":"balanced"}"#,
            &["hold", "rebalance", "DCA"],
            20,
            &[],
        );
        assert_eq!(d.action, "hold");
    }

    #[test]
    fn amount_capped_by_max_trade() {
        let d = validate_decision(
            r#"{"action":"rebalance","token_from":"ETH","token_to":"USDC","amount_percentage":50}"#,
            &["hold", "rebalance", "DCA"],
            20,
            &["ETH".into(), "USDC".into()],
        );
        assert!(d.amount_percentage <= 20);
    }

    #[test]
    fn rebalance_missing_token_to_defaults_to_usdc() {
        let d = validate_decision(
            r#"{"action":"rebalance","token_from":"ETH","amount_percentage":10}"#,
            &["hold", "rebalance", "DCA"],
            20,
            &["ETH".into(), "USDC".into()],
        );
        assert_eq!(d.action, "rebalance");
        assert_eq!(d.token_to.to_uppercase(), "USDC");
    }

    #[test]
    fn never_returns_validation_failed() {
        let d = validate_decision("garbage {}", &["hold", "rebalance", "DCA"], 20, &[]);
        assert_eq!(d.action, "hold");
        assert!(
            !d.reason.to_lowercase().contains("validation failed"),
            "reason must never contain 'validation failed', got: {}",
            d.reason
        );
    }

    /// Simulates LLM response for balanced portfolio → expect hold
    #[test]
    fn scenario_balanced_hold_decision() {
        let d = validate_decision(
            r#"{"action":"hold","reason":"Portfolio is well diversified","confidence":"high"}"#,
            &["hold", "rebalance", "DCA"],
            20,
            &["ETH".into(), "USDC".into(), "BTC".into()],
        );
        assert_eq!(d.action, "hold");
        assert!(!d.reason.is_empty());
    }

    /// Simulates LLM response for ETH heavy → expect rebalance
    #[test]
    fn scenario_eth_heavy_rebalance_decision() {
        let d = validate_decision(
            r#"{"action":"rebalance","token_from":"ETH","token_to":"USDC","amount_percentage":15,"reason":"Reduce volatility","confidence":"medium"}"#,
            &["hold", "rebalance", "DCA"],
            20,
            &["ETH".into(), "USDC".into()],
        );
        assert_eq!(d.action, "rebalance");
        assert!(d.amount_percentage <= 20);
        assert_eq!(d.token_to.to_uppercase(), "USDC");
    }

    /// Simulates LLM response for stablecoin heavy → expect DCA
    #[test]
    fn scenario_stablecoin_heavy_dca_decision() {
        let d = validate_decision(
            r#"{"action":"DCA","token_to":"ETH","amount_percentage":10,"reason":"Increase exposure to growth assets","confidence":"medium"}"#,
            &["hold", "rebalance", "DCA"],
            20,
            &["USDC".into(), "ETH".into()],
        );
        assert_eq!(d.action, "DCA");
    }
}
