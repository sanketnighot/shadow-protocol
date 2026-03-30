//! Guardrails service for validating autonomous actions.
//!
//! Provides user-configurable execution constraints that are validated
//! before any autonomous action is executed. All validations happen
//! in the Rust backend for security.

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tracing::{info, warn};

use super::local_db::{self, GuardrailViolationRecord};
use crate::services::audit;

/// Global kill switch state - when true, all autonomous actions are blocked.
static KILL_SWITCH_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Default guardrails configuration applied when no user config exists.
const DEFAULT_GUARDRAILS: &str = r#"{
  "portfolioFloorUsd": null,
  "maxSingleTxUsd": null,
  "dailySpendLimitUsd": null,
  "weeklySpendLimitUsd": null,
  "allowedChains": null,
  "blockedTokens": [],
  "blockedProtocols": [],
  "executionTimeWindows": null,
  "requireApprovalAboveUsd": null,
  "maxSlippageBps": 300,
  "emergencyKillSwitch": false
}"#;

/// Execution time window for restricting when autonomous actions can run.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionWindow {
    pub day_of_week: Option<String>, // null = any day, or "monday", "tuesday", etc.
    pub start_hour_utc: u8,          // 0-23
    pub end_hour_utc: u8,            // 0-23
}

/// User-configurable guardrail configuration.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GuardrailConfig {
    /// Minimum portfolio value - actions blocked if portfolio would fall below this.
    pub portfolio_floor_usd: Option<f64>,
    /// Maximum value for any single transaction.
    pub max_single_tx_usd: Option<f64>,
    /// Maximum total spend per day.
    pub daily_spend_limit_usd: Option<f64>,
    /// Maximum total spend per week.
    pub weekly_spend_limit_usd: Option<f64>,
    /// Only allow actions on these chains (null = all allowed).
    pub allowed_chains: Option<Vec<String>>,
    /// Block actions involving these token addresses.
    pub blocked_tokens: Option<Vec<String>>,
    /// Block actions on these protocols.
    pub blocked_protocols: Option<Vec<String>>,
    /// Only allow execution during these time windows.
    pub execution_time_windows: Option<Vec<ExecutionWindow>>,
    /// Always require approval for transactions above this USD value.
    pub require_approval_above_usd: Option<f64>,
    /// Maximum allowed slippage in basis points.
    pub max_slippage_bps: Option<u32>,
    /// Emergency kill switch - when true, all autonomous actions are blocked.
    pub emergency_kill_switch: bool,
}

impl Default for GuardrailConfig {
    fn default() -> Self {
        serde_json::from_str(DEFAULT_GUARDRAILS).unwrap_or_else(|_| Self {
            portfolio_floor_usd: None,
            max_single_tx_usd: None,
            daily_spend_limit_usd: None,
            weekly_spend_limit_usd: None,
            allowed_chains: None,
            blocked_tokens: Some(vec![]),
            blocked_protocols: Some(vec![]),
            execution_time_windows: None,
            require_approval_above_usd: None,
            max_slippage_bps: Some(300),
            emergency_kill_switch: false,
        })
    }
}

/// Action context for validation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionContext {
    /// Type of action being validated.
    pub action_type: String,
    /// Chain the action is on.
    pub chain: Option<String>,
    /// Token addresses involved.
    pub token_addresses: Option<Vec<String>>,
    /// Protocol being used.
    pub protocol: Option<String>,
    /// USD value of the action (if applicable).
    pub value_usd: Option<f64>,
    /// Current portfolio total USD value.
    pub portfolio_total_usd: Option<f64>,
    /// Estimated portfolio value after action.
    pub portfolio_after_usd: Option<f64>,
}

/// A single guardrail violation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GuardrailViolation {
    /// Type of guardrail that was violated.
    pub guardrail_type: String,
    /// Human-readable reason for the violation.
    pub reason: String,
    /// Current value that triggered the violation.
    pub current_value: Option<String>,
    /// The limit that was exceeded.
    pub limit_value: Option<String>,
}

/// Result of guardrail validation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuardrailValidationResult {
    /// Whether the action is allowed.
    pub allowed: bool,
    /// List of violations (empty if allowed).
    pub violations: Vec<GuardrailViolation>,
    /// Warnings that don't block but should be shown.
    pub warnings: Vec<String>,
    /// Whether this action requires explicit user approval.
    pub requires_approval: bool,
    /// Reason for requiring approval (if applicable).
    pub approval_reason: Option<String>,
}

impl GuardrailValidationResult {
    #[allow(dead_code)]
    pub fn allowed() -> Self {
        Self {
            allowed: true,
            violations: vec![],
            warnings: vec![],
            requires_approval: false,
            approval_reason: None,
        }
    }

    pub fn blocked(violations: Vec<GuardrailViolation>) -> Self {
        Self {
            allowed: false,
            violations,
            warnings: vec![],
            requires_approval: false,
            approval_reason: None,
        }
    }

    #[allow(dead_code)]
    pub fn with_warnings(warnings: Vec<String>) -> Self {
        Self {
            allowed: true,
            violations: vec![],
            warnings,
            requires_approval: false,
            approval_reason: None,
        }
    }

    #[allow(dead_code)]
    pub fn requires_approval(reason: &str) -> Self {
        Self {
            allowed: true,
            violations: vec![],
            warnings: vec![],
            requires_approval: true,
            approval_reason: Some(reason.to_string()),
        }
    }
}

/// Load the current guardrails configuration.
pub fn load_config() -> GuardrailConfig {
    match local_db::get_guardrails() {
        Ok(Some(record)) => {
            match serde_json::from_str::<GuardrailConfig>(&record.config_json) {
                Ok(config) => {
                    // Update kill switch state from config
                    KILL_SWITCH_ACTIVE.store(config.emergency_kill_switch, Ordering::SeqCst);
                    config
                }
                Err(e) => {
                    warn!("Failed to parse guardrails config: {}, using defaults", e);
                    GuardrailConfig::default()
                }
            }
        }
        Ok(None) => GuardrailConfig::default(),
        Err(e) => {
            warn!("Failed to load guardrails: {}, using defaults", e);
            GuardrailConfig::default()
        }
    }
}

/// Save guardrails configuration.
pub fn save_config(config: &GuardrailConfig) -> Result<(), String> {
    let config_json = serde_json::to_string(config)
        .map_err(|e| format!("Failed to serialize guardrails: {}", e))?;

    local_db::upsert_guardrails(&config_json)
        .map_err(|e| format!("Failed to save guardrails: {}", e))?;

    // Update kill switch state
    KILL_SWITCH_ACTIVE.store(config.emergency_kill_switch, Ordering::SeqCst);

    tracing::info!(kill_switch = config.emergency_kill_switch, "guardrails.saved");

    // Record in audit log
    audit::record(
        "guardrails_updated",
        "guardrails",
        None,
        &serde_json::json!({
            "killSwitchEnabled": config.emergency_kill_switch,
        }),
    );

    Ok(())
}

/// Check if kill switch is active.
pub fn is_kill_switch_active() -> bool {
    KILL_SWITCH_ACTIVE.load(Ordering::SeqCst)
}

/// Activate kill switch immediately.
pub fn activate_kill_switch() -> Result<(), String> {
    let mut config = load_config();
    config.emergency_kill_switch = true;
    save_config(&config)?;

    warn!("guardrails.kill_switch_activated",);

    audit::record(
        "kill_switch_activated",
        "guardrails",
        None,
        &serde_json::json!({
            "trigger": "manual",
        }),
    );

    Ok(())
}

/// Deactivate kill switch.
pub fn deactivate_kill_switch() -> Result<(), String> {
    let mut config = load_config();
    config.emergency_kill_switch = false;
    save_config(&config)?;

    info!("guardrails.kill_switch_deactivated",);

    audit::record(
        "kill_switch_deactivated",
        "guardrails",
        None,
        &serde_json::json!({
            "trigger": "manual",
        }),
    );

    Ok(())
}

/// Validate an action against all guardrails.
pub fn validate_action(context: &ActionContext) -> GuardrailValidationResult {
    let config = load_config();
    let mut violations: Vec<GuardrailViolation> = vec![];
    let mut warnings: Vec<String> = vec![];
    let mut requires_approval = false;
    let mut approval_reason: Option<String> = None;

    // 1. Check kill switch first
    if config.emergency_kill_switch || is_kill_switch_active() {
        violations.push(GuardrailViolation {
            guardrail_type: "kill_switch".to_string(),
            reason: "Emergency kill switch is active - all autonomous actions are blocked".to_string(),
            current_value: Some("active".to_string()),
            limit_value: None,
        });
        return GuardrailValidationResult::blocked(violations);
    }

    // 2. Check portfolio floor
    if let (Some(floor), Some(after_usd)) = (config.portfolio_floor_usd, context.portfolio_after_usd) {
        if after_usd < floor {
            violations.push(GuardrailViolation {
                guardrail_type: "portfolio_floor".to_string(),
                reason: format!(
                    "Action would reduce portfolio to ${:.2}, below floor of ${:.2}",
                    after_usd, floor
                ),
                current_value: Some(format!("${:.2}", after_usd)),
                limit_value: Some(format!("${:.2}", floor)),
            });
        }
    }

    // 3. Check max single transaction
    if let (Some(max), Some(value)) = (config.max_single_tx_usd, context.value_usd) {
        if value > max {
            violations.push(GuardrailViolation {
                guardrail_type: "max_single_tx".to_string(),
                reason: format!(
                    "Transaction value ${:.2} exceeds maximum ${:.2}",
                    value, max
                ),
                current_value: Some(format!("${:.2}", value)),
                limit_value: Some(format!("${:.2}", max)),
            });
        }
    }

    // 4. Check allowed chains
    if let (Some(allowed), Some(chain)) = (&config.allowed_chains, &context.chain) {
        if !allowed.iter().any(|c| c.to_lowercase() == chain.to_lowercase()) {
            violations.push(GuardrailViolation {
                guardrail_type: "allowed_chains".to_string(),
                reason: format!("Chain '{}' is not in the allowed list", chain),
                current_value: Some(chain.clone()),
                limit_value: Some(allowed.join(", ")),
            });
        }
    }

    // 5. Check blocked tokens
    if let (Some(blocked), Some(tokens)) = (&config.blocked_tokens, &context.token_addresses) {
        for token in tokens {
            if blocked.iter().any(|b| b.to_lowercase() == token.to_lowercase()) {
                violations.push(GuardrailViolation {
                    guardrail_type: "blocked_token".to_string(),
                    reason: format!("Token '{}' is blocked", token),
                    current_value: Some(token.clone()),
                    limit_value: None,
                });
            }
        }
    }

    // 6. Check blocked protocols
    if let (Some(blocked), Some(protocol)) = (&config.blocked_protocols, &context.protocol) {
        if blocked.iter().any(|b| b.to_lowercase() == protocol.to_lowercase()) {
            violations.push(GuardrailViolation {
                guardrail_type: "blocked_protocol".to_string(),
                reason: format!("Protocol '{}' is blocked", protocol),
                current_value: Some(protocol.clone()),
                limit_value: None,
            });
        }
    }

    // 7. Check execution time windows
    if let Some(windows) = &config.execution_time_windows {
        if !is_within_execution_window(windows) {
            violations.push(GuardrailViolation {
                guardrail_type: "execution_window".to_string(),
                reason: "Current time is outside allowed execution windows".to_string(),
                current_value: Some(get_current_time_description()),
                limit_value: Some(format!("{} window(s) configured", windows.len())),
            });
        }
    }

    // 8. Check if approval is required above threshold
    if let (Some(threshold), Some(value)) = (config.require_approval_above_usd, context.value_usd) {
        if value > threshold {
            requires_approval = true;
            approval_reason = Some(format!(
                "Transaction value ${:.2} exceeds approval threshold ${:.2}",
                value, threshold
            ));
        }
    }

    // 9. Check slippage warning
    if let Some(max_slippage) = config.max_slippage_bps {
        // This would be checked when actual slippage is known
        // For now, just note the limit exists
        if max_slippage < 50 {
            warnings.push(format!(
                "Very tight slippage tolerance ({} bps) - transactions may fail",
                max_slippage
            ));
        }
    }

    // 10. Check daily/weekly limits (would need spend tracking)
    // This requires tracking daily spend - implemented as a warning for now
    if config.daily_spend_limit_usd.is_some() {
        warnings.push("Daily spend limit configured - tracking not yet implemented".to_string());
    }

    if !violations.is_empty() {
        // Log the violation
        log_violation(&violations, context);
        GuardrailValidationResult::blocked(violations)
    } else if requires_approval {
        GuardrailValidationResult {
            allowed: true,
            violations: vec![],
            warnings,
            requires_approval: true,
            approval_reason,
        }
    } else {
        GuardrailValidationResult {
            allowed: true,
            violations: vec![],
            warnings,
            requires_approval: false,
            approval_reason: None,
        }
    }
}

/// Check if current time is within any execution window.
fn is_within_execution_window(windows: &[ExecutionWindow]) -> bool {
    use chrono::{Datelike, Timelike, Utc};

    let now = Utc::now();
    let current_hour = now.hour() as u8;
    let current_day = now.weekday();

    for window in windows {
        // Check day of week
        if let Some(day) = &window.day_of_week {
            let day_match = match day.to_lowercase().as_str() {
                "monday" => current_day == chrono::Weekday::Mon,
                "tuesday" => current_day == chrono::Weekday::Tue,
                "wednesday" => current_day == chrono::Weekday::Wed,
                "thursday" => current_day == chrono::Weekday::Thu,
                "friday" => current_day == chrono::Weekday::Fri,
                "saturday" => current_day == chrono::Weekday::Sat,
                "sunday" => current_day == chrono::Weekday::Sun,
                _ => true, // Unknown day = allow any day
            };
            if !day_match {
                continue;
            }
        }

        // Check hour
        if window.start_hour_utc <= window.end_hour_utc {
            // Normal range (e.g., 9-17)
            if current_hour >= window.start_hour_utc && current_hour < window.end_hour_utc {
                return true;
            }
        } else {
            // Overnight range (e.g., 22-6)
            if current_hour >= window.start_hour_utc || current_hour < window.end_hour_utc {
                return true;
            }
        }
    }

    false
}

/// Get a description of the current time.
fn get_current_time_description() -> String {
    use chrono::{Datelike, Timelike, Utc};

    let now = Utc::now();
    format!(
        "{} {:02}:{:02} UTC",
        now.weekday(),
        now.hour(),
        now.minute()
    )
}

/// Log a guardrail violation to the database.
fn log_violation(violations: &[GuardrailViolation], context: &ActionContext) {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let record = GuardrailViolationRecord {
        id: uuid::Uuid::new_v4().to_string(),
        guardrail_type: violations.first()
            .map(|v| v.guardrail_type.clone())
            .unwrap_or_else(|| "unknown".to_string()),
        attempted_action_json: serde_json::to_string(context).unwrap_or_else(|_| "{}".to_string()),
        violation_reason: violations.iter()
            .map(|v| v.reason.clone())
            .collect::<Vec<_>>()
            .join("; "),
        blocked_at: now,
        user_overrode: false,
    };

    if let Err(e) = local_db::insert_guardrail_violation(&record) {
        warn!("Failed to log guardrail violation: {}", e);
    }

    // Also log to audit
    audit::record(
        "guardrail_violation",
        "action",
        None,
        &serde_json::json!({
            "actionType": context.action_type,
            "violations": violations.iter().map(|v| &v.guardrail_type).collect::<Vec<_>>(),
        }),
    );
}

/// Record that a user overrode a guardrail violation.
#[allow(dead_code)]
pub fn record_override(violation_id: &str) -> Result<(), String> {
    // In a full implementation, we would update the violation record
    // For now, just log it
    audit::record(
        "guardrail_override",
        "guardrail_violation",
        Some(violation_id),
        &serde_json::json!({
            "overridden": true,
        }),
    );

    tracing::info!(%violation_id, "guardrails.override_recorded");

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config_parses() {
        let config: GuardrailConfig = serde_json::from_str(DEFAULT_GUARDRAILS).unwrap();
        assert!(!config.emergency_kill_switch);
        assert_eq!(config.max_slippage_bps, Some(300_u32));
    }

    #[test]
    fn test_validate_action_kill_switch() {
        let mut config = GuardrailConfig::default();
        config.emergency_kill_switch = true;
        let _ = save_config(&config);

        let context = ActionContext {
            action_type: "transfer".to_string(),
            chain: Some("ethereum".to_string()),
            token_addresses: None,
            protocol: None,
            value_usd: Some(100.0),
            portfolio_total_usd: Some(10000.0),
            portfolio_after_usd: Some(9900.0),
        };

        let result = validate_action(&context);
        assert!(!result.allowed);
        assert!(result.violations.iter().any(|v| v.guardrail_type == "kill_switch"));

        // Clean up
        let config = GuardrailConfig::default();
        let _ = save_config(&config);
    }

    #[test]
    fn test_validate_action_max_tx() {
        let mut config = GuardrailConfig::default();
        config.max_single_tx_usd = Some(500.0);
        let _ = save_config(&config);

        let context = ActionContext {
            action_type: "transfer".to_string(),
            chain: Some("ethereum".to_string()),
            token_addresses: None,
            protocol: None,
            value_usd: Some(1000.0),
            portfolio_total_usd: Some(10000.0),
            portfolio_after_usd: Some(9000.0),
        };

        let result = validate_action(&context);
        assert!(!result.allowed);
        assert!(result.violations.iter().any(|v| v.guardrail_type == "max_single_tx"));

        // Clean up
        let config = GuardrailConfig::default();
        let _ = save_config(&config);
    }

    #[test]
    fn test_validate_action_allowed() {
        let config = GuardrailConfig::default();
        let _ = save_config(&config);

        let context = ActionContext {
            action_type: "transfer".to_string(),
            chain: Some("ethereum".to_string()),
            token_addresses: None,
            protocol: None,
            value_usd: Some(100.0),
            portfolio_total_usd: Some(10000.0),
            portfolio_after_usd: Some(9900.0),
        };

        let result = validate_action(&context);
        assert!(result.allowed);
    }
}
