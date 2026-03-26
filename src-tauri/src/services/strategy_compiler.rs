use serde_json::Value;

use super::strategy_types::{
    default_preview, CompiledStrategyPlan, StrategyAction, StrategyCondition, StrategyDraft,
    StrategyDraftNode, StrategyGuardrails, StrategySimulationResult, StrategyTrigger,
};
use super::strategy_validator::{validate_semantics, validate_structure};

fn parse_node<T: serde::de::DeserializeOwned>(
    node: &StrategyDraftNode,
    field_path: &str,
) -> Result<T, super::strategy_types::StrategyValidationIssue> {
    serde_json::from_value::<T>(node.data.clone()).map_err(|_| {
        super::strategy_types::StrategyValidationIssue {
            code: "node_parse_failed".to_string(),
            severity: "error".to_string(),
            message: format!("Unable to parse node '{}'.", node.id),
            field_path: Some(field_path.to_string()),
        }
    })
}

pub fn normalize_guardrails(guardrails: &StrategyGuardrails) -> StrategyGuardrails {
    let mut normalized = guardrails.clone();
    if normalized.allowed_chains.is_empty() {
        normalized.allowed_chains =
            StrategyGuardrails::default().allowed_chains;
    }
    if normalized.max_per_trade_usd <= 0.0 {
        normalized.max_per_trade_usd = StrategyGuardrails::default().max_per_trade_usd;
    }
    if normalized.max_daily_notional_usd <= 0.0 {
        normalized.max_daily_notional_usd = StrategyGuardrails::default().max_daily_notional_usd;
    }
    if normalized.require_approval_above_usd < 0.0 {
        normalized.require_approval_above_usd = 0.0;
    }
    if normalized.cooldown_seconds < 0 {
        normalized.cooldown_seconds = StrategyGuardrails::default().cooldown_seconds;
    }
    normalized
}

pub fn compile_draft(
    strategy_id: String,
    version: i64,
    draft: &StrategyDraft,
) -> StrategySimulationResult {
    let structure = validate_structure(draft);
    if !structure.errors.is_empty() {
        return StrategySimulationResult {
            strategy_id: Some(strategy_id),
            valid: false,
            plan: None,
            evaluation_preview: default_preview("no_op", "Invalid strategy graph".to_string()),
            message: "Strategy graph is invalid.".to_string(),
        };
    }

    let ordered_nodes: Vec<&StrategyDraftNode> = structure
        .ordered_node_ids
        .iter()
        .filter_map(|id| draft.nodes.iter().find(|node| &node.id == id))
        .collect();

    let Some(trigger_node) = ordered_nodes.first() else {
        return StrategySimulationResult {
            strategy_id: Some(strategy_id),
            valid: false,
            plan: None,
            evaluation_preview: default_preview("no_op", "Missing trigger".to_string()),
            message: "Strategy graph is missing a trigger.".to_string(),
        };
    };
    let Some(action_node) = ordered_nodes.last() else {
        return StrategySimulationResult {
            strategy_id: Some(strategy_id),
            valid: false,
            plan: None,
            evaluation_preview: default_preview("no_op", "Missing action".to_string()),
            message: "Strategy graph is missing an action.".to_string(),
        };
    };

    let mut errors = Vec::new();
    let mut warnings = structure.warnings;

    let trigger = match parse_node::<StrategyTrigger>(trigger_node, "nodes.trigger") {
        Ok(value) => value,
        Err(issue) => {
            errors.push(issue);
            return StrategySimulationResult {
                strategy_id: Some(strategy_id),
                valid: false,
                plan: None,
                evaluation_preview: default_preview("no_op", "Invalid trigger".to_string()),
                message: "Trigger configuration is invalid.".to_string(),
            };
        }
    };

    let mut conditions = Vec::new();
    for condition_node in ordered_nodes.iter().skip(1).take(ordered_nodes.len().saturating_sub(2)) {
        match parse_node::<StrategyCondition>(condition_node, "nodes.condition") {
            Ok(value) => conditions.push(value),
            Err(issue) => errors.push(issue),
        }
    }

    let action = match parse_node::<StrategyAction>(action_node, "nodes.action") {
        Ok(value) => value,
        Err(issue) => {
            errors.push(issue);
            return StrategySimulationResult {
                strategy_id: Some(strategy_id),
                valid: false,
                plan: None,
                evaluation_preview: default_preview("no_op", "Invalid action".to_string()),
                message: "Action configuration is invalid.".to_string(),
            };
        }
    };

    let (semantic_errors, semantic_warnings) = validate_semantics(draft, &trigger, &action);
    errors.extend(semantic_errors);
    warnings.extend(semantic_warnings);

    let normalized_guardrails = normalize_guardrails(&draft.guardrails);
    let valid = errors.is_empty();
    let plan = CompiledStrategyPlan {
        strategy_id: strategy_id.clone(),
        version,
        template: draft.template.clone(),
        trigger: trigger.clone(),
        conditions: conditions.clone(),
        action: action.clone(),
        normalized_guardrails,
        valid,
        validation_errors: errors.clone(),
        warnings: warnings.clone(),
    };

    StrategySimulationResult {
        strategy_id: Some(strategy_id),
        valid,
        plan: Some(plan),
        evaluation_preview: default_preview(
            if draft.mode == "monitor_only" {
                "monitor_only"
            } else if draft.mode == "pre_authorized" {
                "pre_authorized"
            } else {
                "approval_required"
            },
            describe_action(&action),
        ),
        message: if valid {
            "Strategy compiled successfully.".to_string()
        } else {
            "Strategy failed validation.".to_string()
        },
    }
}

pub fn describe_action(action: &StrategyAction) -> String {
    match action {
        StrategyAction::DcaBuy {
            from_symbol,
            to_symbol,
            amount_usd,
            amount_token,
            ..
        } => {
            if let Some(amount) = amount_usd {
                format!("Swap ${amount:.2} {from_symbol} into {to_symbol}.")
            } else if let Some(amount) = amount_token {
                format!("Swap {amount:.6} {from_symbol} into {to_symbol}.")
            } else {
                format!("Swap {from_symbol} into {to_symbol}.")
            }
        }
        StrategyAction::RebalanceToTarget { chain, .. } => {
            format!("Rebalance portfolio toward target allocations on {chain}.")
        }
        StrategyAction::AlertOnly { title, .. } => format!("Emit alert: {title}."),
    }
}

pub fn infer_template_from_legacy(trigger: &Value, action: &Value) -> String {
    let action_type = action.get("type").and_then(|value| value.as_str()).unwrap_or_default();
    if matches!(action_type, "rebalance_to_target" | "rebalance" | "drift") {
        return "rebalance_to_target".to_string();
    }
    if matches!(action_type, "alert_only" | "alert") {
        return "alert_only".to_string();
    }
    let trigger_type = trigger.get("type").and_then(|value| value.as_str()).unwrap_or_default();
    if matches!(action_type, "swap" | "dca_buy") || trigger_type == "time" {
        return "dca_buy".to_string();
    }
    "alert_only".to_string()
}

