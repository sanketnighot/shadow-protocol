//! Behavior learner service for learning user preferences.
//!
//! Tracks user decisions and learns preferences over time using
//! Bayesian updates. These preferences inform the autonomous agent's
//! recommendations and task generation.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{info, warn};

use super::local_db::{self, BehaviorEventRecord, LearnedPreferenceRecord};
use super::audit;

/// Types of behavior events.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum BehaviorEventType {
    Approval,
    Rejection,
    StrategyActivation,
    StrategyDeactivation,
    TradeExecuted,
    TransferCompleted,
    OpportunityViewed,
    OpportunityDismissed,
    SettingsChanged,
    TaskCompleted,
    TaskFailed,
}

impl std::fmt::Display for BehaviorEventType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BehaviorEventType::Approval => write!(f, "approval"),
            BehaviorEventType::Rejection => write!(f, "rejection"),
            BehaviorEventType::StrategyActivation => write!(f, "strategy_activation"),
            BehaviorEventType::StrategyDeactivation => write!(f, "strategy_deactivation"),
            BehaviorEventType::TradeExecuted => write!(f, "trade_executed"),
            BehaviorEventType::TransferCompleted => write!(f, "transfer_completed"),
            BehaviorEventType::OpportunityViewed => write!(f, "opportunity_viewed"),
            BehaviorEventType::OpportunityDismissed => write!(f, "opportunity_dismissed"),
            BehaviorEventType::SettingsChanged => write!(f, "settings_changed"),
            BehaviorEventType::TaskCompleted => write!(f, "task_completed"),
            BehaviorEventType::TaskFailed => write!(f, "task_failed"),
        }
    }
}

/// Categories of learned preferences.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PreferenceCategory {
    RiskTolerance,
    TokenPreference,
    ChainPreference,
    TradeSize,
    ProtocolPreference,
    TimePreference,
    StrategyType,
}

impl std::fmt::Display for PreferenceCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PreferenceCategory::RiskTolerance => write!(f, "risk_tolerance"),
            PreferenceCategory::TokenPreference => write!(f, "token_preference"),
            PreferenceCategory::ChainPreference => write!(f, "chain_preference"),
            PreferenceCategory::TradeSize => write!(f, "trade_size"),
            PreferenceCategory::ProtocolPreference => write!(f, "protocol_preference"),
            PreferenceCategory::TimePreference => write!(f, "time_preference"),
            PreferenceCategory::StrategyType => write!(f, "strategy_type"),
        }
    }
}

/// Context for a behavior event.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BehaviorContext {
    pub portfolio_total_usd: Option<f64>,
    pub top_holdings: Option<Vec<String>>,
    pub market_condition: Option<String>,
    pub active_strategies: Option<Vec<String>>,
    pub persona: Option<String>,
    pub risk_appetite: Option<String>,
}

/// Decision made by the user.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BehaviorDecision {
    pub action: String,
    pub value_usd: Option<f64>,
    pub chain: Option<String>,
    pub tokens: Option<Vec<String>>,
    pub protocol: Option<String>,
    pub strategy_type: Option<String>,
    pub details: Option<HashMap<String, String>>,
}

/// Outcome of the decision (filled in later).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BehaviorOutcome {
    pub success: bool,
    pub value_change_usd: Option<f64>,
    pub observed_at: i64,
    pub notes: Option<String>,
}

/// Record a behavior event.
pub fn record_event(
    event_type: BehaviorEventType,
    context: &BehaviorContext,
    decision: &BehaviorDecision,
    outcome: Option<&BehaviorOutcome>,
) -> Result<String, String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let record = BehaviorEventRecord {
        id: uuid::Uuid::new_v4().to_string(),
        event_type: event_type.to_string(),
        context_json: serde_json::to_string(context)
            .map_err(|e| format!("Failed to serialize context: {}", e))?,
        decision_json: serde_json::to_string(decision)
            .map_err(|e| format!("Failed to serialize decision: {}", e))?,
        outcome_json: outcome.map(|o| {
            serde_json::to_string(o).unwrap_or_else(|_| "{}".to_string())
        }),
        created_at: now,
    };

    local_db::insert_behavior_event(&record)
        .map_err(|e| format!("Failed to insert behavior event: {}", e))?;

    // Trigger learning update
    if let Err(e) = update_learning_from_event(&event_type, context, decision, outcome) {
        warn!("Failed to update learning from event: {}", e);
    }

    // Log to audit
    audit::record(
        &format!("behavior_{}", event_type),
        "behavior_event",
        Some(&record.id),
        &serde_json::json!({
            "action": decision.action,
            "chain": decision.chain,
        }),
    );

    info!(event_type = %event_type, "behavior.event_recorded");

    Ok(record.id)
}

/// Record a simple behavior event with minimal context.
pub fn record_simple_event(
    event_type: BehaviorEventType,
    entity_id: &str,
    metadata: serde_json::Value,
) -> Result<String, String> {
    let context = BehaviorContext {
        portfolio_total_usd: None,
        top_holdings: None,
        market_condition: None,
        active_strategies: None,
        persona: None,
        risk_appetite: None,
    };

    let decision = BehaviorDecision {
        action: entity_id.to_string(),
        value_usd: metadata.get("value_usd").and_then(|v| v.as_f64()),
        chain: metadata.get("chain").and_then(|v| v.as_str()).map(String::from),
        tokens: metadata.get("tokens").and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect()),
        protocol: metadata.get("protocol").and_then(|v| v.as_str()).map(String::from),
        strategy_type: metadata.get("strategy_type").and_then(|v| v.as_str()).map(String::from),
        details: None,
    };

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let outcome = BehaviorOutcome {
        success: metadata.get("success").and_then(|v| v.as_bool()).unwrap_or(true),
        value_change_usd: metadata.get("value_change_usd").and_then(|v| v.as_f64()),
        observed_at: now,
        notes: metadata.get("notes").and_then(|v| v.as_str()).map(String::from),
    };

    record_event(event_type, &context, &decision, Some(&outcome))
}

/// Update learned preferences based on a new event.
fn update_learning_from_event(
    event_type: &BehaviorEventType,
    _context: &BehaviorContext,
    decision: &BehaviorDecision,
    outcome: Option<&BehaviorOutcome>,
) -> Result<(), String> {
    match event_type {
        BehaviorEventType::Approval => {
            // User approved an action - reinforce positive signals
            if let Some(chain) = &decision.chain {
                reinforce_preference(
                    PreferenceCategory::ChainPreference,
                    chain,
                    true,
                )?;
            }
            if let Some(tokens) = &decision.tokens {
                for token in tokens {
                    reinforce_preference(
                        PreferenceCategory::TokenPreference,
                        token,
                        true,
                    )?;
                }
            }
        }
        BehaviorEventType::Rejection => {
            // User rejected an action - reinforce negative signals
            if let Some(chain) = &decision.chain {
                reinforce_preference(
                    PreferenceCategory::ChainPreference,
                    chain,
                    false,
                )?;
            }
        }
        BehaviorEventType::TaskCompleted => {
            // Task completed successfully - slight positive reinforcement
            if outcome.map(|o| o.success).unwrap_or(false) {
                if let Some(tokens) = &decision.tokens {
                    for token in tokens {
                        reinforce_preference(
                            PreferenceCategory::TokenPreference,
                            token,
                            true,
                        )?;
                    }
                }
            }
        }
        _ => {}
    }

    Ok(())
}

/// Reinforce a preference value using Bayesian update.
fn reinforce_preference(
    category: PreferenceCategory,
    key: &str,
    positive: bool,
) -> Result<(), String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    // Check if preference already exists
    let existing = local_db::get_learned_preference(key)
        .map_err(|e| format!("Failed to get preference: {}", e))?;

    let record = if let Some(existing) = existing {
        // Update existing preference
        let new_sample_count = existing.sample_count + 1;
        // Update confidence using Bayesian update
        let new_confidence = if positive {
            ((existing.confidence * existing.sample_count as f64) + 1.0)
                / new_sample_count as f64
        } else {
            ((existing.confidence * existing.sample_count as f64) - 0.5)
                .max(0.1) / new_sample_count as f64
        };

        LearnedPreferenceRecord {
            id: existing.id,
            category: category.to_string(),
            preference_key: key.to_string(),
            preference_value_json: positive.to_string(),
            confidence: new_confidence.min(0.99),
            sample_count: new_sample_count,
            first_observed_at: existing.first_observed_at,
            last_reinforced_at: now,
        }
    } else {
        // Create new preference
        LearnedPreferenceRecord {
            id: uuid::Uuid::new_v4().to_string(),
            category: category.to_string(),
            preference_key: key.to_string(),
            preference_value_json: positive.to_string(),
            confidence: if positive { 0.7 } else { 0.3 },
            sample_count: 1,
            first_observed_at: now,
            last_reinforced_at: now,
        }
    };

    local_db::upsert_learned_preference(&record)
        .map_err(|e| format!("Failed to upsert preference: {}", e))?;

    Ok(())
}

/// Get all learned preferences.
pub fn get_all_preferences() -> Result<Vec<LearnedPreferenceRecord>, String> {
    local_db::get_learned_preferences(None)
        .map_err(|e| format!("Failed to get preferences: {}", e))
}

/// Get preferences as a HashMap for use in scoring/matching.
pub fn get_preferences_map() -> HashMap<String, f64> {
    match get_all_preferences() {
        Ok(prefs) => prefs
            .into_iter()
            .filter_map(|p| {
                // Use confidence as preference strength
                Some((p.preference_key, p.confidence))
            })
            .collect(),
        Err(_) => HashMap::new(),
    }
}

/// Get preferences for a specific category.
#[allow(dead_code)]
pub fn get_preferences_by_category(
    category: PreferenceCategory,
) -> Result<Vec<LearnedPreferenceRecord>, String> {
    local_db::get_learned_preferences(Some(&category.to_string()))
        .map_err(|e| format!("Failed to get preferences: {}", e))
}

/// Get a specific preference by key.
#[allow(dead_code)]
pub fn get_preference(key: &str) -> Result<Option<LearnedPreferenceRecord>, String> {
    local_db::get_learned_preference(key)
        .map_err(|e| format!("Failed to get preference: {}", e))
}

/// Manually update a preference (user override).
#[allow(dead_code)]
pub fn set_preference<T: Serialize>(
    category: PreferenceCategory,
    key: &str,
    value: T,
    confidence: f64,
) -> Result<(), String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let existing = local_db::get_learned_preference(key)
        .map_err(|e| format!("Failed to get preference: {}", e))?;

    let record = LearnedPreferenceRecord {
        id: existing.as_ref().map(|e| e.id.clone()).unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
        category: category.to_string(),
        preference_key: key.to_string(),
        preference_value_json: serde_json::to_string(&value)
            .map_err(|e| format!("Failed to serialize value: {}", e))?,
        confidence: confidence.clamp(0.0, 1.0),
        sample_count: existing.as_ref().map(|e| e.sample_count + 1).unwrap_or(1),
        first_observed_at: existing.as_ref().map(|e| e.first_observed_at).unwrap_or(now),
        last_reinforced_at: now,
    };

    local_db::upsert_learned_preference(&record)
        .map_err(|e| format!("Failed to set preference: {}", e))?;

    info!(key, confidence, "behavior.preference_set");
    Ok(())
}

/// Get preferences formatted for inclusion in agent system prompt.
#[allow(dead_code)]
pub fn get_preferences_for_prompt() -> String {
    let preferences = match get_all_preferences() {
        Ok(p) => p,
        Err(e) => {
            warn!("Failed to get preferences for prompt: {}", e);
            return String::new();
        }
    };

    if preferences.is_empty() {
        return String::new();
    }

    // Group by category
    let mut grouped: HashMap<String, Vec<&LearnedPreferenceRecord>> = HashMap::new();
    for pref in &preferences {
        grouped
            .entry(pref.category.clone())
            .or_default()
            .push(pref);
    }

    let mut lines = vec!["## Learned User Preferences\n".to_string()];

    for (category, prefs) in grouped {
        lines.push(format!("\n### {}\n", category.replace('_', " ")));
        for pref in prefs {
            if pref.confidence >= 0.6 {
                // Only include confident preferences
                let value = pref.preference_value_json.trim_matches('"');
                lines.push(format!(
                    "- {} (confidence: {:.0}%)\n",
                    pref.preference_key.replace('_', " "),
                    pref.confidence * 100.0
                ));
                if value != "true" && value != "false" {
                    lines.push(format!("  Value: {}\n", value));
                }
            }
        }
    }

    lines.join("")
}

/// Get recent behavior events.
#[allow(dead_code)]
pub fn get_recent_events(limit: u32) -> Result<Vec<BehaviorEventRecord>, String> {
    local_db::get_behavior_events(None, limit)
        .map_err(|e| format!("Failed to get events: {}", e))
}

/// Count events of a specific type.
#[allow(dead_code)]
pub fn count_events(event_type: BehaviorEventType) -> Result<i64, String> {
    local_db::count_behavior_events(&event_type.to_string())
        .map_err(|e| format!("Failed to count events: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_type_display() {
        assert_eq!(BehaviorEventType::Approval.to_string(), "approval");
        assert_eq!(BehaviorEventType::Rejection.to_string(), "rejection");
    }

    #[test]
    fn test_preference_category_display() {
        assert_eq!(PreferenceCategory::RiskTolerance.to_string(), "risk_tolerance");
        assert_eq!(PreferenceCategory::ChainPreference.to_string(), "chain_preference");
    }
}
