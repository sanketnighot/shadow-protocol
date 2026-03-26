//! Legacy strategy JSON inference and DB migration backfill.

use rusqlite::{params, Connection};

use crate::services::local_db::{ActiveStrategy, DbError};
use crate::services::strategy_compiler::compile_draft;
use crate::services::strategy_types::{
    DraftNodeData, StrategyApprovalPolicy, StrategyDraft, StrategyDraftEdge, StrategyDraftNode,
    StrategyExecutionPolicy, StrategyGuardrails, StrategyMode, StrategyNodeType, StrategyTemplate,
    Position, TargetAllocationRow,
};

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn infer_template(trigger_json: &str, action_json: &str) -> StrategyTemplate {
    let trigger: serde_json::Value = serde_json::from_str(trigger_json).unwrap_or_else(|_| serde_json::json!({}));
    let action: serde_json::Value = serde_json::from_str(action_json).unwrap_or_else(|_| serde_json::json!({}));
    let action_type = action
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if action_type.contains("alert") {
        return StrategyTemplate::AlertOnly;
    }
    if action_type.contains("rebalance") || action.get("targetAllocations").is_some() {
        return StrategyTemplate::RebalanceToTarget;
    }
    if trigger.get("driftPct").is_some() || trigger.get("type").and_then(|t| t.as_str()) == Some("drift_threshold") {
        return StrategyTemplate::RebalanceToTarget;
    }
    StrategyTemplate::DcaBuy
}

fn parse_mode(s: &str) -> StrategyMode {
    match s {
        "monitor_only" => StrategyMode::MonitorOnly,
        "pre_authorized" => StrategyMode::PreAuthorized,
        _ => StrategyMode::ApprovalRequired,
    }
}

#[allow(clippy::too_many_arguments)]
fn legacy_to_draft(
    id: &str,
    name: &str,
    summary: Option<String>,
    mode: &str,
    template: StrategyTemplate,
    trigger_json: &str,
    action_json: &str,
    guardrails: &StrategyGuardrails,
    approval_policy_json: &str,
    execution_policy_json: &str,
) -> StrategyDraft {
    let trigger_val: serde_json::Value =
        serde_json::from_str(trigger_json).unwrap_or_else(|_| serde_json::json!({}));
    let action_val: serde_json::Value =
        serde_json::from_str(action_json).unwrap_or_else(|_| serde_json::json!({}));

    let approval_policy: StrategyApprovalPolicy =
        serde_json::from_str(approval_policy_json).unwrap_or_default();
    let execution_policy: StrategyExecutionPolicy =
        serde_json::from_str(execution_policy_json).unwrap_or_default();

    let trigger_data = match template {
        StrategyTemplate::DcaBuy => {
            let interval = trigger_val
                .get("interval")
                .and_then(|v| v.as_str())
                .unwrap_or("weekly")
                .to_string();
            DraftNodeData::TimeInterval {
                interval,
                anchor_timestamp: None,
                timezone: Some("UTC".to_string()),
            }
        }
        StrategyTemplate::RebalanceToTarget => {
            if trigger_val.get("driftPct").is_some()
                || trigger_val.get("type").and_then(|t| t.as_str()) == Some("drift_threshold")
            {
                let targets = parse_allocations(&trigger_val);
                DraftNodeData::DriftThreshold {
                    drift_pct: trigger_val
                        .get("driftPct")
                        .and_then(|v| v.as_f64())
                        .unwrap_or(5.0),
                    evaluation_interval_seconds: Some(300),
                    target_allocations: if targets.is_empty() {
                        default_allocations()
                    } else {
                        targets
                    },
                }
            } else {
                DraftNodeData::TimeInterval {
                    interval: "daily".to_string(),
                    anchor_timestamp: None,
                    timezone: Some("UTC".to_string()),
                }
            }
        }
        StrategyTemplate::AlertOnly => DraftNodeData::Threshold {
            metric: "portfolio_value_usd".to_string(),
            operator: "lte".to_string(),
            value: trigger_val
                .get("value")
                .and_then(|v| v.as_f64())
                .unwrap_or(5_000.0),
            evaluation_interval_seconds: Some(300),
        },
    };

    let action_data = match template {
        StrategyTemplate::DcaBuy => DraftNodeData::DcaBuy {
            chain: action_val
                .get("chain")
                .and_then(|v| v.as_str())
                .unwrap_or("ethereum")
                .to_string(),
            from_symbol: action_val
                .get("fromSymbol")
                .or_else(|| action_val.get("from_symbol"))
                .and_then(|v| v.as_str())
                .unwrap_or("USDC")
                .to_string(),
            to_symbol: action_val
                .get("toSymbol")
                .or_else(|| action_val.get("to_symbol"))
                .and_then(|v| v.as_str())
                .unwrap_or("ETH")
                .to_string(),
            amount_usd: action_val
                .get("amountUsd")
                .or_else(|| action_val.get("amount_usd"))
                .and_then(|v| v.as_f64()),
            amount_token: None,
        },
        StrategyTemplate::RebalanceToTarget => {
            let targets = parse_allocations(&action_val);
            DraftNodeData::RebalanceToTarget {
                chain: action_val
                    .get("chain")
                    .and_then(|v| v.as_str())
                    .unwrap_or("multi_chain")
                    .to_string(),
                threshold_pct: action_val
                    .get("thresholdPct")
                    .or_else(|| action_val.get("threshold_pct"))
                    .and_then(|v| v.as_f64())
                    .unwrap_or(5.0),
                max_execution_usd: action_val
                    .get("maxExecutionUsd")
                    .or_else(|| action_val.get("max_execution_usd"))
                    .and_then(|v| v.as_f64()),
                target_allocations: if targets.is_empty() {
                    default_allocations()
                } else {
                    targets
                },
            }
        }
        StrategyTemplate::AlertOnly => DraftNodeData::AlertOnly {
            title: "Legacy alert".to_string(),
            message_template: "Migrated strategy; open builder to configure.".to_string(),
            severity: "info".to_string(),
        },
    };

    let (nodes, edges) = match template {
        StrategyTemplate::AlertOnly => (
            vec![
                StrategyDraftNode {
                    id: "trigger-1".to_string(),
                    node_type: StrategyNodeType::Trigger,
                    position: Position { x: 0.0, y: 60.0 },
                    data: trigger_data,
                },
                StrategyDraftNode {
                    id: "action-1".to_string(),
                    node_type: StrategyNodeType::Action,
                    position: Position { x: 320.0, y: 60.0 },
                    data: action_data,
                },
            ],
            vec![StrategyDraftEdge {
                id: "edge-1".to_string(),
                source: "trigger-1".to_string(),
                target: "action-1".to_string(),
            }],
        ),
        _ => (
            vec![
                StrategyDraftNode {
                    id: "trigger-1".to_string(),
                    node_type: StrategyNodeType::Trigger,
                    position: Position { x: 0.0, y: 60.0 },
                    data: trigger_data,
                },
                StrategyDraftNode {
                    id: "condition-1".to_string(),
                    node_type: StrategyNodeType::Condition,
                    position: Position { x: 280.0, y: 60.0 },
                    data: DraftNodeData::Cooldown {
                        cooldown_seconds: guardrails.cooldown_seconds.unwrap_or(300),
                    },
                },
                StrategyDraftNode {
                    id: "action-1".to_string(),
                    node_type: StrategyNodeType::Action,
                    position: Position { x: 560.0, y: 60.0 },
                    data: action_data,
                },
            ],
            vec![
                StrategyDraftEdge {
                    id: "edge-1".to_string(),
                    source: "trigger-1".to_string(),
                    target: "condition-1".to_string(),
                },
                StrategyDraftEdge {
                    id: "edge-2".to_string(),
                    source: "condition-1".to_string(),
                    target: "action-1".to_string(),
                },
            ],
        ),
    };

    StrategyDraft {
        id: Some(id.to_string()),
        name: name.to_string(),
        summary,
        template,
        mode: parse_mode(mode),
        nodes,
        edges,
        guardrails: guardrails.clone(),
        approval_policy,
        execution_policy,
    }
}

fn default_allocations() -> Vec<TargetAllocationRow> {
    vec![
        TargetAllocationRow {
            symbol: "ETH".to_string(),
            percentage: 50.0,
        },
        TargetAllocationRow {
            symbol: "USDC".to_string(),
            percentage: 50.0,
        },
    ]
}

fn parse_allocations(v: &serde_json::Value) -> Vec<TargetAllocationRow> {
    v.get("targetAllocations")
        .or_else(|| v.get("target_allocations"))
        .and_then(|a| a.as_array())
            .map(|arr| {
            arr.iter()
                .map(|item| TargetAllocationRow {
                    symbol: item
                        .get("symbol")
                        .and_then(|s| s.as_str())
                        .unwrap_or("")
                        .to_string(),
                    percentage: item.get("percentage").and_then(|p| p.as_f64()).unwrap_or(0.0),
                })
                .filter(|r| !r.symbol.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

/// Builds or refreshes `ActiveStrategy` rows from loose legacy JSON (agent/chat paths).
#[allow(clippy::too_many_arguments)]
pub fn infer_strategy_fields_for_legacy(
    id: &str,
    name: &str,
    summary: Option<String>,
    mode: &str,
    trigger_json: &str,
    action_json: &str,
    guardrails_json: &str,
    approval_policy_json: &str,
    execution_policy_json: &str,
) -> ActiveStrategy {
    let guardrails: StrategyGuardrails =
        serde_json::from_str(guardrails_json).unwrap_or_default();
    let template = infer_template(trigger_json, action_json);
    let draft = legacy_to_draft(
        id,
        name,
        summary,
        mode,
        template,
        trigger_json,
        action_json,
        &guardrails,
        approval_policy_json,
        execution_policy_json,
    );
    let compiled = compile_draft(&draft, id, 1);
    let validation_state = if compiled.valid { "valid" } else { "invalid" };
    let compiled_plan_json = serde_json::to_string(&compiled).unwrap_or_else(|_| "{}".to_string());
    let draft_graph_json = serde_json::to_string(&draft).unwrap_or_else(|_| "{}".to_string());
    ActiveStrategy {
        id: id.to_string(),
        name: name.to_string(),
        summary: draft.summary.clone(),
        status: "paused".to_string(),
        template: template_string(&template),
        mode: mode.to_string(),
        version: 1,
        trigger_json: trigger_json.to_string(),
        action_json: action_json.to_string(),
        guardrails_json: guardrails_json.to_string(),
        draft_graph_json,
        compiled_plan_json,
        validation_state: validation_state.to_string(),
        last_simulation_json: None,
        last_execution_status: None,
        last_execution_reason: None,
        approval_policy_json: approval_policy_json.to_string(),
        execution_policy_json: execution_policy_json.to_string(),
        failure_count: 0,
        last_evaluation_at: None,
        disabled_reason: if compiled.valid {
            None
        } else {
            Some("needs_manual_repair".to_string())
        },
        last_run_at: None,
        next_run_at: None,
        updated_at: Some(now_secs()),
    }
}

fn template_string(t: &StrategyTemplate) -> String {
    match t {
        StrategyTemplate::DcaBuy => "dca_buy".to_string(),
        StrategyTemplate::RebalanceToTarget => "rebalance_to_target".to_string(),
        StrategyTemplate::AlertOnly => "alert_only".to_string(),
    }
}

/// Backfill compiled plans for rows that still lack them.
pub fn migrate_legacy_strategies(conn: &Connection) -> Result<(), DbError> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, summary, status, template, mode, version, trigger_json, action_json, guardrails_json, approval_policy_json, execution_policy_json, failure_count, last_run_at, next_run_at, last_evaluation_at, disabled_reason, last_execution_status, last_execution_reason, last_simulation_json, updated_at FROM active_strategies WHERE compiled_plan_json IS NULL OR trim(compiled_plan_json) = '' OR trim(compiled_plan_json) = '{}' OR trim(compiled_plan_json) = 'null'",
        )
        .map_err(DbError::Sqlite)?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, String>(11)?,
                row.get::<_, i64>(12)?,
                row.get::<_, Option<i64>>(13)?,
                row.get::<_, Option<i64>>(14)?,
                row.get::<_, Option<i64>>(15)?,
                row.get::<_, Option<String>>(16)?,
                row.get::<_, Option<String>>(17)?,
                row.get::<_, Option<String>>(18)?,
                row.get::<_, Option<String>>(19)?,
                row.get::<_, Option<i64>>(20)?,
            ))
        })
        .map_err(DbError::Sqlite)?;

    for r in rows {
        let (
            id,
            name,
            summary,
            status,
            _template_col,
            mode,
            version,
            trigger_json,
            action_json,
            guardrails_json,
            approval_policy_json,
            execution_policy_json,
            failure_count,
            last_run_at,
            next_run_at,
            last_evaluation_at,
            disabled_reason,
            last_execution_status,
            last_execution_reason,
            last_simulation_json,
            updated_at,
        ) = r.map_err(DbError::Sqlite)?;

        let guardrails: StrategyGuardrails =
            serde_json::from_str(&guardrails_json).unwrap_or_default();
        let template = infer_template(&trigger_json, &action_json);
        let draft = legacy_to_draft(
            &id,
            &name,
            summary.clone(),
            &mode,
            template,
            &trigger_json,
            &action_json,
            &guardrails,
            &approval_policy_json,
            &execution_policy_json,
        );
        let compiled = compile_draft(&draft, &id, version.max(1));
        let validation_state = if compiled.valid { "valid" } else { "invalid" };
        let compiled_plan_json = serde_json::to_string(&compiled).unwrap_or_else(|_| "{}".to_string());
        let draft_graph_json = serde_json::to_string(&draft).unwrap_or_else(|_| "{}".to_string());
        let next_status = if compiled.valid {
            status.clone()
        } else {
            "paused".to_string()
        };
        let disabled = if compiled.valid {
            disabled_reason.clone()
        } else {
            Some(
                disabled_reason
                    .clone()
                    .unwrap_or_else(|| "needs_manual_repair".to_string()),
            )
        };

        conn.execute(
            r#"UPDATE active_strategies SET
                draft_graph_json = ?1,
                compiled_plan_json = ?2,
                validation_state = ?3,
                template = ?4,
                status = ?5,
                disabled_reason = ?6,
                updated_at = ?7
            WHERE id = ?8"#,
            params![
                draft_graph_json,
                compiled_plan_json,
                validation_state,
                template_string(&template),
                next_status,
                disabled,
                now_secs(),
                id,
            ],
        )
        .map_err(DbError::Sqlite)?;

        let _preserve = (
            failure_count,
            last_run_at,
            next_run_at,
            last_evaluation_at,
            last_execution_status,
            last_execution_reason,
            last_simulation_json,
            updated_at,
        );
    }

    Ok(())
}
