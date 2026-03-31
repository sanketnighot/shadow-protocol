//! Compile `StrategyDraft` into `CompiledStrategyPlan`.

use std::collections::HashMap;

use crate::services::strategy_types::{
    CompiledStrategyPlan, DraftNodeData, StrategyAction, StrategyCondition, StrategyDraft,
    StrategyDraftNode, StrategyGuardrails, StrategyNodeType, StrategyTemplate, StrategyTrigger,
    TargetAllocationSpec, TargetAllocationRow,
};

fn is_flow_cadence_chain(chain: &str) -> bool {
    let c = chain.trim().to_ascii_lowercase();
    if c.contains("flow-evm") || c.contains("flow_evm") {
        return false;
    }
    c == "flow" || c.starts_with("flow-")
}
use crate::services::strategy_validator::validate_draft;

fn row_to_spec(row: &TargetAllocationRow) -> TargetAllocationSpec {
    TargetAllocationSpec {
        symbol: row.symbol.trim().to_string(),
        percentage: row.percentage,
    }
}

fn map_trigger(data: &DraftNodeData) -> Result<StrategyTrigger, String> {
    match data {
        DraftNodeData::TimeInterval {
            interval,
            anchor_timestamp,
            timezone,
        } => Ok(StrategyTrigger::TimeInterval {
            interval: interval.trim().to_string(),
            anchor_timestamp: *anchor_timestamp,
            timezone: timezone.clone(),
        }),
        DraftNodeData::DriftThreshold {
            drift_pct,
            evaluation_interval_seconds,
            target_allocations,
        } => Ok(StrategyTrigger::DriftThreshold {
            drift_pct: *drift_pct,
            evaluation_interval_seconds: *evaluation_interval_seconds,
            target_allocations: target_allocations.iter().map(row_to_spec).collect(),
        }),
        DraftNodeData::Threshold {
            metric,
            operator,
            value,
            evaluation_interval_seconds,
        } => Ok(StrategyTrigger::Threshold {
            metric: metric.trim().to_string(),
            operator: operator.trim().to_string(),
            value: *value,
            evaluation_interval_seconds: *evaluation_interval_seconds,
        }),
        _ => Err("Invalid trigger payload for this node.".to_string()),
    }
}

fn map_condition(data: &DraftNodeData) -> Result<StrategyCondition, String> {
    match data {
        DraftNodeData::PortfolioFloor { min_portfolio_usd } => Ok(StrategyCondition::PortfolioFloor {
            min_portfolio_usd: *min_portfolio_usd,
        }),
        DraftNodeData::MaxGas { max_gas_usd } => Ok(StrategyCondition::MaxGas {
            max_gas_usd: *max_gas_usd,
        }),
        DraftNodeData::MaxSlippage { max_slippage_bps } => Ok(StrategyCondition::MaxSlippage {
            max_slippage_bps: *max_slippage_bps,
        }),
        DraftNodeData::WalletAssetAvailable { symbol, min_amount } => {
            Ok(StrategyCondition::WalletAssetAvailable {
                symbol: symbol.trim().to_string(),
                min_amount: *min_amount,
            })
        }
        DraftNodeData::Cooldown { cooldown_seconds } => Ok(StrategyCondition::Cooldown {
            cooldown_seconds: *cooldown_seconds,
        }),
        DraftNodeData::DriftMinimum { min_drift_pct } => Ok(StrategyCondition::DriftMinimum {
            min_drift_pct: *min_drift_pct,
        }),
        _ => Err("Node is not a supported condition type.".to_string()),
    }
}

fn map_action(data: &DraftNodeData) -> Result<StrategyAction, String> {
    match data {
        DraftNodeData::DcaBuy {
            chain,
            from_symbol,
            to_symbol,
            amount_usd,
            amount_token,
            flow_on_chain,
        } => {
            if let Some(ref foc) = flow_on_chain {
                if foc.enabled && is_flow_cadence_chain(chain) {
                    let handler_type = foc
                        .handler_type
                        .as_ref()
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .unwrap_or_else(|| "dca".to_string());
                    let params = serde_json::json!({
                        "fromSymbol": from_symbol.trim(),
                        "toSymbol": to_symbol.trim(),
                        "amountUsd": amount_usd,
                        "amountToken": amount_token,
                    });
                    return Ok(StrategyAction::FlowScheduled {
                        chain: chain.trim().to_string(),
                        handler_type,
                        cron_expression: foc.cron_expression.clone(),
                        one_shot_timestamp: foc.one_shot_timestamp,
                        handler_params: params,
                    });
                }
            }
            Ok(StrategyAction::DcaBuy {
                chain: chain.trim().to_string(),
                from_symbol: from_symbol.trim().to_string(),
                to_symbol: to_symbol.trim().to_string(),
                amount_usd: *amount_usd,
                amount_token: *amount_token,
            })
        }
        DraftNodeData::RebalanceToTarget {
            chain,
            threshold_pct,
            max_execution_usd,
            target_allocations,
            flow_on_chain,
        } => {
            if let Some(ref foc) = flow_on_chain {
                if foc.enabled && is_flow_cadence_chain(chain) {
                    let handler_type = foc
                        .handler_type
                        .as_ref()
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .unwrap_or_else(|| "rebalance".to_string());
                    let params = serde_json::json!({
                        "thresholdPct": threshold_pct,
                        "maxExecutionUsd": max_execution_usd,
                        "targetAllocations": target_allocations.iter().map(row_to_spec).collect::<Vec<_>>(),
                    });
                    return Ok(StrategyAction::FlowScheduled {
                        chain: chain.trim().to_string(),
                        handler_type,
                        cron_expression: foc.cron_expression.clone(),
                        one_shot_timestamp: foc.one_shot_timestamp,
                        handler_params: params,
                    });
                }
            }
            Ok(StrategyAction::RebalanceToTarget {
                chain: chain.trim().to_string(),
                threshold_pct: *threshold_pct,
                target_allocations: target_allocations.iter().map(row_to_spec).collect(),
                max_execution_usd: *max_execution_usd,
            })
        }
        DraftNodeData::AlertOnly {
            title,
            message_template,
            severity,
        } => Ok(StrategyAction::AlertOnly {
            title: title.clone(),
            message_template: message_template.clone(),
            severity: severity.clone(),
        }),
        _ => Err("Invalid action payload for this node.".to_string()),
    }
}

fn normalize_guardrails(draft: &StrategyDraft, template: &StrategyTemplate) -> StrategyGuardrails {
    let mut g = draft.guardrails.clone();
    if matches!(template, StrategyTemplate::AlertOnly) {
        return g;
    }
    if g.max_per_trade_usd.is_none() {
        g.max_per_trade_usd = Some(1_000.0);
    }
    if g.max_daily_notional_usd.is_none() {
        g.max_daily_notional_usd = Some(2_500.0);
    }
    if g.min_portfolio_usd.is_none() {
        g.min_portfolio_usd = Some(0.0);
    }
    if g.cooldown_seconds.is_none() {
        g.cooldown_seconds = Some(300);
    }
    if g.max_slippage_bps.is_none() {
        g.max_slippage_bps = Some(50);
    }
    if g.max_gas_usd.is_none() {
        g.max_gas_usd = Some(25.0);
    }
    g
}

/// Returns ordered nodes from trigger to action inclusive, or None if structure is invalid.
fn ordered_pipeline_nodes(draft: &StrategyDraft) -> Option<Vec<&StrategyDraftNode>> {
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
    if triggers.len() != 1 || actions.len() != 1 {
        return None;
    }
    let trigger_id = triggers[0].id.as_str();
    let action_id = actions[0].id.as_str();
    let by_id: HashMap<&str, &StrategyDraftNode> =
        draft.nodes.iter().map(|n| (n.id.as_str(), n)).collect();
    let mut outgoing: HashMap<&str, &str> = HashMap::new();
    for e in &draft.edges {
        outgoing.insert(e.source.as_str(), e.target.as_str());
    }
    let mut out = Vec::new();
    let mut cur = trigger_id;
    loop {
        let node = by_id.get(cur)?;
        out.push(*node);
        if cur == action_id {
            break;
        }
        cur = outgoing.get(cur).copied()?;
    }
    if out.len() != draft.nodes.len() {
        return None;
    }
    Some(out)
}

pub fn compile_draft(
    draft: &StrategyDraft,
    strategy_id: &str,
    version: i64,
) -> CompiledStrategyPlan {
    let (mut errors, warnings) = validate_draft(draft);
    let normalized_guardrails = normalize_guardrails(draft, &draft.template);

    let Some(ordered) = ordered_pipeline_nodes(draft) else {
        if errors.is_empty() {
            errors.push(crate::services::strategy_types::StrategyValidationIssue {
                code: "pipeline".to_string(),
                severity: "error".to_string(),
                message: "Could not derive a linear pipeline from the draft.".to_string(),
                field_path: Some("nodes".to_string()),
            });
        }
        return CompiledStrategyPlan {
            strategy_id: strategy_id.to_string(),
            version,
            template: draft.template,
            trigger: StrategyTrigger::TimeInterval {
                interval: "daily".to_string(),
                anchor_timestamp: None,
                timezone: Some("UTC".to_string()),
            },
            conditions: vec![],
            action: StrategyAction::AlertOnly {
                title: "Invalid strategy".to_string(),
                message_template: "Compile failed.".to_string(),
                severity: "warning".to_string(),
            },
            normalized_guardrails,
            valid: false,
            validation_errors: errors,
            warnings,
        };
    };

    let trigger_node = ordered.first().expect("non-empty pipeline");
    let action_node = ordered.last().expect("non-empty pipeline");

    let trigger = match map_trigger(&trigger_node.data) {
        Ok(t) => t,
        Err(msg) => {
            errors.push(crate::services::strategy_types::StrategyValidationIssue {
                code: "map_trigger".to_string(),
                severity: "error".to_string(),
                message: msg,
                field_path: Some(format!("nodes.{}", trigger_node.id)),
            });
            StrategyTrigger::TimeInterval {
                interval: "daily".to_string(),
                anchor_timestamp: None,
                timezone: Some("UTC".to_string()),
            }
        }
    };

    let mut conditions = Vec::new();
    for node in ordered.iter().skip(1).take(ordered.len().saturating_sub(2)) {
        if node.node_type != StrategyNodeType::Condition {
            continue;
        }
        match map_condition(&node.data) {
            Ok(c) => conditions.push(c),
            Err(msg) => {
                errors.push(crate::services::strategy_types::StrategyValidationIssue {
                    code: "map_condition".to_string(),
                    severity: "error".to_string(),
                    message: msg,
                    field_path: Some(format!("nodes.{}", node.id)),
                });
            }
        }
    }

    let action = match map_action(&action_node.data) {
        Ok(a) => a,
        Err(msg) => {
            errors.push(crate::services::strategy_types::StrategyValidationIssue {
                code: "map_action".to_string(),
                severity: "error".to_string(),
                message: msg,
                field_path: Some(format!("nodes.{}", action_node.id)),
            });
            StrategyAction::AlertOnly {
                title: "Invalid strategy".to_string(),
                message_template: "Action mapping failed.".to_string(),
                severity: "critical".to_string(),
            }
        }
    };

    let valid = errors.is_empty();
    CompiledStrategyPlan {
        strategy_id: strategy_id.to_string(),
        version,
        template: draft.template,
        trigger,
        conditions,
        action,
        normalized_guardrails,
        valid,
        validation_errors: errors,
        warnings,
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

    fn minimal_dca_draft() -> StrategyDraft {
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
                        flow_on_chain: None,
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
    fn compile_valid_dca_plan() {
        let draft = minimal_dca_draft();
        let plan = compile_draft(&draft, "sid", 1);
        assert!(plan.valid, "{:?}", plan.validation_errors);
        assert!(matches!(plan.trigger, StrategyTrigger::TimeInterval { .. }));
        assert!(matches!(plan.action, StrategyAction::DcaBuy { .. }));
    }

    #[test]
    fn compile_empty_name_invalid() {
        let mut draft = minimal_dca_draft();
        draft.name = "   ".to_string();
        let plan = compile_draft(&draft, "sid", 1);
        assert!(!plan.valid);
        assert!(plan
            .validation_errors
            .iter()
            .any(|e| e.code == "name_required"));
    }
}
