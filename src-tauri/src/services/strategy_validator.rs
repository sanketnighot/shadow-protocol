use std::collections::{HashMap, HashSet};

use super::strategy_types::{
    StrategyAction, StrategyDraft, StrategyNodeType, StrategyTrigger, StrategyValidationIssue,
};

fn issue(code: &str, severity: &str, message: impl Into<String>, field_path: Option<String>) -> StrategyValidationIssue {
    StrategyValidationIssue {
        code: code.to_string(),
        severity: severity.to_string(),
        message: message.into(),
        field_path,
    }
}

pub struct StructureValidation {
    pub ordered_node_ids: Vec<String>,
    pub errors: Vec<StrategyValidationIssue>,
    pub warnings: Vec<StrategyValidationIssue>,
}

pub fn validate_structure(draft: &StrategyDraft) -> StructureValidation {
    let mut errors = Vec::new();
    let warnings = Vec::new();

    let trigger_ids: Vec<&str> = draft
        .nodes
        .iter()
        .filter(|node| node.node_type == StrategyNodeType::Trigger)
        .map(|node| node.id.as_str())
        .collect();
    let action_ids: Vec<&str> = draft
        .nodes
        .iter()
        .filter(|node| node.node_type == StrategyNodeType::Action)
        .map(|node| node.id.as_str())
        .collect();

    if trigger_ids.len() != 1 {
        errors.push(issue(
            "invalid_trigger_count",
            "error",
            "Strategy must contain exactly one trigger node.",
            Some("nodes".to_string()),
        ));
    }

    if action_ids.len() != 1 {
        errors.push(issue(
            "invalid_action_count",
            "error",
            "Strategy must contain exactly one action node.",
            Some("nodes".to_string()),
        ));
    }

    let mut node_index = HashMap::new();
    for node in &draft.nodes {
        if node_index.insert(node.id.clone(), node).is_some() {
            errors.push(issue(
                "duplicate_node_id",
                "error",
                format!("Duplicate node id '{}'.", node.id),
                Some("nodes".to_string()),
            ));
        }
    }

    let mut out_degree: HashMap<&str, usize> = HashMap::new();
    let mut in_degree: HashMap<&str, usize> = HashMap::new();
    let mut next_by_source: HashMap<&str, &str> = HashMap::new();

    for edge in &draft.edges {
        if !node_index.contains_key(&edge.source) || !node_index.contains_key(&edge.target) {
            errors.push(issue(
                "dangling_edge",
                "error",
                format!("Edge '{}' references a missing node.", edge.id),
                Some(format!("edges.{}", edge.id)),
            ));
            continue;
        }
        *out_degree.entry(edge.source.as_str()).or_insert(0) += 1;
        *in_degree.entry(edge.target.as_str()).or_insert(0) += 1;
        if next_by_source.insert(edge.source.as_str(), edge.target.as_str()).is_some() {
            errors.push(issue(
                "branching_not_supported",
                "error",
                "Branching graphs are not supported in v1.",
                Some(format!("edges.{}", edge.id)),
            ));
        }
    }

    for node in &draft.nodes {
        let in_count = *in_degree.get(node.id.as_str()).unwrap_or(&0);
        let out_count = *out_degree.get(node.id.as_str()).unwrap_or(&0);
        match node.node_type {
            StrategyNodeType::Trigger => {
                if in_count != 0 {
                    errors.push(issue(
                        "trigger_incoming_edge",
                        "error",
                        "Trigger node cannot have incoming edges.",
                        Some(format!("nodes.{}", node.id)),
                    ));
                }
                if out_count > 1 {
                    errors.push(issue(
                        "trigger_branching",
                        "error",
                        "Trigger node cannot branch to multiple targets.",
                        Some(format!("nodes.{}", node.id)),
                    ));
                }
            }
            StrategyNodeType::Condition => {
                if in_count != 1 || out_count != 1 {
                    errors.push(issue(
                        "condition_not_linear",
                        "error",
                        "Condition nodes must have exactly one incoming and one outgoing edge.",
                        Some(format!("nodes.{}", node.id)),
                    ));
                }
            }
            StrategyNodeType::Action => {
                if out_count != 0 {
                    errors.push(issue(
                        "action_outgoing_edge",
                        "error",
                        "Action node cannot have outgoing edges.",
                        Some(format!("nodes.{}", node.id)),
                    ));
                }
                if in_count != 1 && draft.nodes.len() > 1 {
                    errors.push(issue(
                        "action_missing_input",
                        "error",
                        "Action node must be the terminal node in the linear pipeline.",
                        Some(format!("nodes.{}", node.id)),
                    ));
                }
            }
        }
    }

    let Some(start_id) = trigger_ids.first().copied() else {
        return StructureValidation {
            ordered_node_ids: Vec::new(),
            errors,
            warnings,
        };
    };

    let mut ordered = Vec::new();
    let mut visited = HashSet::new();
    let mut current = Some(start_id);
    while let Some(node_id) = current {
        if !visited.insert(node_id.to_string()) {
            errors.push(issue(
                "cycle_detected",
                "error",
                "Strategy graph contains a cycle.",
                Some("edges".to_string()),
            ));
            break;
        }
        ordered.push(node_id.to_string());
        current = next_by_source.get(node_id).copied();
    }

    if visited.len() != draft.nodes.len() {
        errors.push(issue(
            "disconnected_graph",
            "error",
            "All nodes must be connected in a single linear pipeline.",
            Some("nodes".to_string()),
        ));
    }

    StructureValidation {
        ordered_node_ids: ordered,
        errors,
        warnings,
    }
}

pub fn validate_semantics(
    draft: &StrategyDraft,
    trigger: &StrategyTrigger,
    action: &StrategyAction,
) -> (Vec<StrategyValidationIssue>, Vec<StrategyValidationIssue>) {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    if draft.name.trim().len() < 3 {
        errors.push(issue(
            "name_too_short",
            "error",
            "Strategy name must be at least 3 characters.",
            Some("name".to_string()),
        ));
    }

    if !(draft.mode == "monitor_only"
        || draft.mode == "approval_required"
        || draft.mode == "pre_authorized")
    {
        errors.push(issue(
            "invalid_mode",
            "error",
            "Mode must be monitor_only, approval_required, or pre_authorized.",
            Some("mode".to_string()),
        ));
    }

    if draft.guardrails.max_per_trade_usd <= 0.0 {
        errors.push(issue(
            "invalid_max_trade",
            "error",
            "Max per trade must be positive.",
            Some("guardrails.maxPerTradeUsd".to_string()),
        ));
    }
    if draft.guardrails.max_daily_notional_usd <= 0.0 {
        errors.push(issue(
            "invalid_daily_notional",
            "error",
            "Max daily notional must be positive.",
            Some("guardrails.maxDailyNotionalUsd".to_string()),
        ));
    }
    if draft.guardrails.cooldown_seconds < 0 {
        errors.push(issue(
            "invalid_cooldown",
            "error",
            "Cooldown must be zero or positive.",
            Some("guardrails.cooldownSeconds".to_string()),
        ));
    }

    let template = draft.template.as_str();
    match (template, action) {
        ("dca_buy", StrategyAction::DcaBuy { .. }) => {}
        ("rebalance_to_target", StrategyAction::RebalanceToTarget { .. }) => {}
        ("alert_only", StrategyAction::AlertOnly { .. }) => {}
        _ => errors.push(issue(
            "template_action_mismatch",
            "error",
            "Action does not match the selected strategy template.",
            Some("template".to_string()),
        )),
    }

    match (template, trigger) {
        ("dca_buy", StrategyTrigger::TimeInterval { .. }) => {}
        ("rebalance_to_target", StrategyTrigger::TimeInterval { .. })
        | ("rebalance_to_target", StrategyTrigger::DriftThreshold { .. }) => {}
        ("alert_only", StrategyTrigger::TimeInterval { .. })
        | ("alert_only", StrategyTrigger::DriftThreshold { .. })
        | ("alert_only", StrategyTrigger::Threshold { .. }) => {}
        _ => errors.push(issue(
            "template_trigger_mismatch",
            "error",
            "Trigger type is not supported by the selected strategy template.",
            Some("template".to_string()),
        )),
    }

    if draft.mode == "pre_authorized" && template == "alert_only" {
        errors.push(issue(
            "preauthorized_alert_only",
            "error",
            "Alert-only strategies cannot use pre-authorized mode.",
            Some("mode".to_string()),
        ));
    }

    if draft.mode == "pre_authorized" && !draft.execution_policy.enabled {
        warnings.push(issue(
            "preauthorized_execution_disabled",
            "warning",
            "Pre-authorized mode is enabled, but executionPolicy.enabled is false. The engine will fall back safely.",
            Some("executionPolicy.enabled".to_string()),
        ));
    }

    if let StrategyAction::RebalanceToTarget { target_allocations, .. } = action {
        let total: f64 = target_allocations.iter().map(|item| item.percentage).sum();
        if (total - 100.0).abs() > 0.5 {
            warnings.push(issue(
                "target_allocations_not_100",
                "warning",
                "Target allocations do not sum to exactly 100%. Rebalance evaluation may behave conservatively.",
                Some("action.targetAllocations".to_string()),
            ));
        }
    }

    (errors, warnings)
}

