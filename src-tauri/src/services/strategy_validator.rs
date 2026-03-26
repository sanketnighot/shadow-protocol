//! Structural and semantic validation for strategy drafts and compiled plans.

use std::collections::{HashMap, HashSet};

use crate::services::strategy_types::{
    DraftNodeData, StrategyDraft, StrategyMode, StrategyNodeType, StrategyTemplate,
    StrategyValidationIssue,
};

const MAX_NAME_LEN: usize = 120;
const MAX_SUMMARY_LEN: usize = 2_000;

pub fn validate_draft(draft: &StrategyDraft) -> (Vec<StrategyValidationIssue>, Vec<StrategyValidationIssue>) {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    let name = draft.name.trim();
    if name.is_empty() {
        errors.push(issue(
            "name_required",
            "error",
            "Strategy name is required.",
            Some("name"),
        ));
    } else if name.len() > MAX_NAME_LEN {
        errors.push(issue(
            "name_too_long",
            "error",
            "Strategy name is too long.",
            Some("name"),
        ));
    }

    if let Some(s) = &draft.summary {
        if s.len() > MAX_SUMMARY_LEN {
            errors.push(issue(
                "summary_too_long",
                "error",
                "Summary is too long.",
                Some("summary"),
            ));
        }
    }

    validate_mode_template(&draft.mode, &draft.template, &mut errors);

    let triggers: Vec<_> = draft
        .nodes
        .iter()
        .filter(|n| n.node_type == StrategyNodeType::Trigger)
        .collect();
    let actions: Vec<_> = draft
        .nodes
        .iter()
        .filter(|n| n.node_type == StrategyNodeType::Action)
        .collect();
    let conditions: Vec<_> = draft
        .nodes
        .iter()
        .filter(|n| n.node_type == StrategyNodeType::Condition)
        .collect();

    if triggers.len() != 1 {
        errors.push(issue(
            "trigger_count",
            "error",
            "Exactly one trigger node is required.",
            Some("nodes"),
        ));
    }
    if actions.len() != 1 {
        errors.push(issue(
            "action_count",
            "error",
            "Exactly one action node is required.",
            Some("nodes"),
        ));
    }

    if triggers.len() == 1 && actions.len() == 1 {
        let pipeline_ok =
            validate_linear_pipeline(draft, triggers[0].id.as_str(), actions[0].id.as_str(), &mut errors);
        if pipeline_ok {
            validate_template_payload(
                &draft.template,
                triggers[0].data.clone(),
                actions[0].data.clone(),
                &mut errors,
                &mut warnings,
            );
        }
    }

    validate_guardrails(&draft.guardrails, &draft.template, &mut errors, &mut warnings);

    if conditions.len() > 20 {
        warnings.push(issue(
            "many_conditions",
            "warning",
            "Large condition chains are harder to reason about.",
            Some("nodes"),
        ));
    }

    (errors, warnings)
}

fn validate_mode_template(mode: &StrategyMode, template: &StrategyTemplate, errors: &mut Vec<StrategyValidationIssue>) {
    if mode == &StrategyMode::PreAuthorized && matches!(template, StrategyTemplate::AlertOnly) {
        errors.push(issue(
            "preauth_alert",
            "error",
            "Pre-authorized mode is not allowed for alert-only strategies.",
            Some("mode"),
        ));
    }
}

fn validate_linear_pipeline(
    draft: &StrategyDraft,
    trigger_id: &str,
    action_id: &str,
    errors: &mut Vec<StrategyValidationIssue>,
) -> bool {
    let ids: HashSet<&str> = draft.nodes.iter().map(|n| n.id.as_str()).collect();
    let mut outgoing: HashMap<&str, &str> = HashMap::new();
    let mut incoming_count: HashMap<&str, usize> = HashMap::new();

    for edge in &draft.edges {
        if !ids.contains(edge.source.as_str()) || !ids.contains(edge.target.as_str()) {
            errors.push(issue(
                "edge_unknown_node",
                "error",
                "Edge references an unknown node.",
                Some("edges"),
            ));
            return false;
        }
        if outgoing.insert(edge.source.as_str(), edge.target.as_str()).is_some() {
            errors.push(issue(
                "fan_out",
                "error",
                "Each node may have at most one outgoing edge.",
                Some("edges"),
            ));
            return false;
        }
        *incoming_count.entry(edge.target.as_str()).or_insert(0) += 1;
    }

    for node in &draft.nodes {
        let id = node.id.as_str();
        if id == trigger_id {
            if incoming_count.get(id).copied().unwrap_or(0) > 0 {
                errors.push(issue(
                    "trigger_incoming",
                    "error",
                    "Trigger must not have incoming edges.",
                    Some("edges"),
                ));
                return false;
            }
        } else if id == action_id {
            if outgoing.contains_key(id) {
                errors.push(issue(
                    "action_outgoing",
                    "error",
                    "Action must not have outgoing edges.",
                    Some("edges"),
                ));
                return false;
            }
        } else if incoming_count.get(id).copied().unwrap_or(0) > 1 {
            errors.push(issue(
                "fan_in",
                "error",
                "Each node may have at most one incoming edge.",
                Some("edges"),
            ));
            return false;
        }
    }

    let mut visited = Vec::new();
    let mut cur = trigger_id;
    let mut seen = HashSet::new();
    loop {
        if !seen.insert(cur) {
            errors.push(issue(
                "cycle",
                "error",
                "Strategy graph must not contain cycles.",
                Some("edges"),
            ));
            return false;
        }
        visited.push(cur);
        if cur == action_id {
            break;
        }
        let Some(next) = outgoing.get(cur).copied() else {
            errors.push(issue(
                "broken_chain",
                "error",
                "Trigger is not connected to the action by a single linear chain.",
                Some("edges"),
            ));
            return false;
        };
        cur = next;
    }

    if visited.len() != draft.nodes.len() {
        errors.push(issue(
            "disconnected",
            "error",
            "All nodes must be part of the trigger-to-action chain.",
            Some("nodes"),
        ));
        return false;
    }
    true
}

fn validate_template_payload(
    template: &StrategyTemplate,
    trigger_data: DraftNodeData,
    action_data: DraftNodeData,
    errors: &mut Vec<StrategyValidationIssue>,
    warnings: &mut Vec<StrategyValidationIssue>,
) {
    match template {
        StrategyTemplate::DcaBuy => {
            if !matches!(trigger_data, DraftNodeData::TimeInterval { .. }) {
                errors.push(issue(
                    "dca_trigger",
                    "error",
                    "DCA template requires a time interval trigger.",
                    Some("nodes"),
                ));
            }
            if !matches!(action_data, DraftNodeData::DcaBuy { .. }) {
                errors.push(issue(
                    "dca_action",
                    "error",
                    "DCA template requires a DCA buy action.",
                    Some("nodes"),
                ));
            }
        }
        StrategyTemplate::RebalanceToTarget => {
            let ok_trigger = matches!(
                trigger_data,
                DraftNodeData::TimeInterval { .. } | DraftNodeData::DriftThreshold { .. }
            );
            if !ok_trigger {
                errors.push(issue(
                    "rebalance_trigger",
                    "error",
                    "Rebalance template requires a time interval or drift threshold trigger.",
                    Some("nodes"),
                ));
            }
            if !matches!(action_data, DraftNodeData::RebalanceToTarget { .. }) {
                errors.push(issue(
                    "rebalance_action",
                    "error",
                    "Rebalance template requires a rebalance action.",
                    Some("nodes"),
                ));
            }
        }
        StrategyTemplate::AlertOnly => {
            if matches!(trigger_data, DraftNodeData::TimeInterval { .. }) {
                warnings.push(issue(
                    "alert_time_trigger",
                    "warning",
                    "Time-based alert strategies still require portfolio data for meaningful checks.",
                    Some("nodes"),
                ));
            }
            if !matches!(action_data, DraftNodeData::AlertOnly { .. }) {
                errors.push(issue(
                    "alert_action",
                    "error",
                    "Alert template requires an alert-only action.",
                    Some("nodes"),
                ));
            }
        }
    }
}

fn validate_guardrails(
    g: &crate::services::strategy_types::StrategyGuardrails,
    template: &StrategyTemplate,
    errors: &mut Vec<StrategyValidationIssue>,
    warnings: &mut Vec<StrategyValidationIssue>,
) {
    if matches!(template, StrategyTemplate::AlertOnly) {
        return;
    }
    let max_trade = g.max_per_trade_usd.unwrap_or(0.0);
    if max_trade <= 0.0 {
        errors.push(issue(
            "guardrail_max_trade",
            "error",
            "maxPerTradeUsd must be positive for funds-moving strategies.",
            Some("guardrails.maxPerTradeUsd"),
        ));
    }
    if let Some(d) = g.max_daily_notional_usd {
        if d <= 0.0 {
            errors.push(issue(
                "guardrail_daily",
                "error",
                "maxDailyNotionalUsd must be positive when set.",
                Some("guardrails.maxDailyNotionalUsd"),
            ));
        }
    }
    if let Some(b) = g.max_slippage_bps {
        if b > 10_000 {
            errors.push(issue(
                "guardrail_slippage",
                "error",
                "maxSlippageBps is out of range.",
                Some("guardrails.maxSlippageBps"),
            ));
        }
    }
    if g.allowed_chains.as_ref().map(|c| c.is_empty()).unwrap_or(false) {
        warnings.push(issue(
            "guardrail_chains",
            "warning",
            "allowedChains is empty; no chain will pass allowlist checks at runtime.",
            Some("guardrails.allowedChains"),
        ));
    }
}

fn issue(
    code: &str,
    severity: &str,
    message: &str,
    field_path: Option<&str>,
) -> StrategyValidationIssue {
    StrategyValidationIssue {
        code: code.to_string(),
        severity: severity.to_string(),
        message: message.to_string(),
        field_path: field_path.map(String::from),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::strategy_types::{
        DraftNodeData, Position, StrategyApprovalPolicy, StrategyDraft, StrategyDraftEdge,
        StrategyDraftNode, StrategyExecutionPolicy, StrategyGuardrails, StrategyMode,
        StrategyNodeType, StrategyTemplate,
    };

    fn base_draft() -> StrategyDraft {
        StrategyDraft {
            id: None,
            name: "Test".to_string(),
            summary: None,
            template: StrategyTemplate::DcaBuy,
            mode: StrategyMode::ApprovalRequired,
            nodes: vec![
                StrategyDraftNode {
                    id: "trigger-1".to_string(),
                    node_type: StrategyNodeType::Trigger,
                    position: Position { x: 0.0, y: 0.0 },
                    data: DraftNodeData::TimeInterval {
                        interval: "daily".to_string(),
                        anchor_timestamp: None,
                        timezone: Some("UTC".to_string()),
                    },
                },
                StrategyDraftNode {
                    id: "action-1".to_string(),
                    node_type: StrategyNodeType::Action,
                    position: Position { x: 100.0, y: 0.0 },
                    data: DraftNodeData::DcaBuy {
                        chain: "ethereum".to_string(),
                        from_symbol: "USDC".to_string(),
                        to_symbol: "ETH".to_string(),
                        amount_usd: Some(10.0),
                        amount_token: None,
                    },
                },
            ],
            edges: vec![StrategyDraftEdge {
                id: "e1".to_string(),
                source: "trigger-1".to_string(),
                target: "action-1".to_string(),
            }],
            guardrails: StrategyGuardrails {
                max_per_trade_usd: Some(100.0),
                ..Default::default()
            },
            approval_policy: StrategyApprovalPolicy::default(),
            execution_policy: StrategyExecutionPolicy::default(),
        }
    }

    #[test]
    fn valid_linear_dca_passes_structure() {
        let d = base_draft();
        let (errors, _) = validate_draft(&d);
        assert!(
            errors.iter().all(|e| e.code != "trigger_count" && e.code != "action_count"),
            "{errors:?}"
        );
    }

    #[test]
    fn two_triggers_fail() {
        let mut d = base_draft();
        d.nodes.push(StrategyDraftNode {
            id: "trigger-2".to_string(),
            node_type: StrategyNodeType::Trigger,
            position: Position { x: 0.0, y: 0.0 },
            data: DraftNodeData::TimeInterval {
                interval: "hourly".to_string(),
                anchor_timestamp: None,
                timezone: None,
            },
        });
        let (errors, _) = validate_draft(&d);
        assert!(errors.iter().any(|e| e.code == "trigger_count"));
    }

    #[test]
    fn preauth_with_alert_template_fails() {
        let mut d = base_draft();
        d.mode = StrategyMode::PreAuthorized;
        d.template = StrategyTemplate::AlertOnly;
        d.nodes[1].data = DraftNodeData::AlertOnly {
            title: "t".to_string(),
            message_template: "m".to_string(),
            severity: "info".to_string(),
        };
        d.nodes[0].data = DraftNodeData::Threshold {
            metric: "portfolio_value_usd".to_string(),
            operator: "lte".to_string(),
            value: 1.0,
            evaluation_interval_seconds: None,
        };
        let (errors, _) = validate_draft(&d);
        assert!(errors.iter().any(|e| e.code == "preauth_alert"));
    }
}
