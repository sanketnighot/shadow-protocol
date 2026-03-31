//! Evaluates compiled automation strategies on the heartbeat tick.
//!
//! Flow and Filecoin “recurring” automation that targets external networks is primarily driven by
//! [`crate::services::apps::scheduler`] (scheduler jobs → approvals / backups), not by adding new
//! `StrategyAction` variants here. Native EVM strategy actions remain in this module.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::commands;
use crate::services::audit;
use crate::services::local_db::{
    self, ActiveStrategy, ApprovalRecord, StrategyExecutionRecord, TokenRow,
};
use crate::services::strategy_scheduler;
use crate::services::strategy_types::{
    CompiledStrategyPlan, StrategyAction, StrategyCondition, StrategyConditionPreview,
    StrategyExecutionPolicy, StrategyGuardrails, StrategyTrigger, TargetAllocationSpec,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyEvaluationResult {
    pub strategy_id: String,
    pub action: String,
    pub status: String,
    pub message: String,
    pub approval_id: Option<String>,
}

#[derive(Debug, Clone)]
struct EvalContext {
    now: i64,
    total_portfolio_usd: f64,
    latest_snapshot_age_secs: Option<i64>,
    tokens: Vec<TokenRow>,
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn parse_money(value: &str) -> f64 {
    value.replace(['$', ','], "").trim().parse::<f64>().unwrap_or(0.0)
}

fn parse_balance(value: &str) -> f64 {
    value
        .split_whitespace()
        .next()
        .unwrap_or("0")
        .replace(',', "")
        .parse::<f64>()
        .unwrap_or(0.0)
}

fn load_execution_policy(strategy: &ActiveStrategy) -> StrategyExecutionPolicy {
    serde_json::from_str(&strategy.execution_policy_json).unwrap_or_default()
}

fn load_compiled_plan(strategy: &ActiveStrategy) -> Result<CompiledStrategyPlan, String> {
    if strategy.compiled_plan_json.trim().is_empty()
        || strategy.compiled_plan_json.trim() == "{}"
        || strategy.compiled_plan_json.trim() == "null"
    {
        return Err("Strategy has no compiled plan".to_string());
    }

    serde_json::from_str::<Option<CompiledStrategyPlan>>(&strategy.compiled_plan_json)
        .ok()
        .flatten()
        .or_else(|| serde_json::from_str::<CompiledStrategyPlan>(&strategy.compiled_plan_json).ok())
        .ok_or_else(|| "Failed to parse compiled plan".to_string())
}

fn build_context(app: &AppHandle, now: i64) -> EvalContext {
    let addresses = commands::get_addresses(app);
    let tokens = local_db::get_tokens_for_wallets(&addresses).unwrap_or_default();
    let latest_snapshot = local_db::get_portfolio_snapshots(1)
        .ok()
        .and_then(|mut rows| rows.pop());
    let total_portfolio_usd = latest_snapshot
        .as_ref()
        .map(|snapshot| parse_money(&snapshot.total_usd))
        .unwrap_or_else(|| tokens.iter().map(|token| parse_money(&token.value_usd)).sum());
    let latest_snapshot_age_secs = latest_snapshot.map(|snapshot| now - snapshot.timestamp);
    EvalContext {
        now,
        total_portfolio_usd,
        latest_snapshot_age_secs,
        tokens,
    }
}

fn compute_max_observed_drift_pct(
    ctx: &EvalContext,
    targets: &[crate::services::strategy_types::TargetAllocationSpec],
) -> f64 {
    if ctx.total_portfolio_usd <= 0.0 {
        return 0.0;
    }
    targets
        .iter()
        .map(|target| {
            let current_value: f64 = ctx
                .tokens
                .iter()
                .filter(|token| token.symbol.eq_ignore_ascii_case(&target.symbol))
                .map(|token| parse_money(&token.value_usd))
                .sum();
            let current_pct = (current_value / ctx.total_portfolio_usd) * 100.0;
            (current_pct - target.percentage).abs()
        })
        .fold(0.0, f64::max)
}

fn evaluate_trigger(
    strategy: &ActiveStrategy,
    plan: &CompiledStrategyPlan,
    ctx: &EvalContext,
) -> Result<(bool, String), String> {
    match &plan.trigger {
        StrategyTrigger::TimeInterval { .. } => Ok((
            strategy.next_run_at.map(|next| next <= ctx.now).unwrap_or(true),
            "Time trigger evaluated.".to_string(),
        )),
        StrategyTrigger::DriftThreshold {
            drift_pct,
            target_allocations,
            ..
        } => {
            if ctx.latest_snapshot_age_secs.map(|age| age > 900).unwrap_or(true) {
                return Ok((false, "Latest portfolio snapshot is stale.".to_string()));
            }
            let drift = compute_max_observed_drift_pct(ctx, target_allocations);
            Ok((drift >= *drift_pct, format!("Observed drift is {:.2}%.", drift)))
        }
        StrategyTrigger::Threshold {
            metric,
            operator,
            value,
            ..
        } => {
            let observed = match metric.as_str() {
                "portfolio_value_usd" => ctx.total_portfolio_usd,
                _ => return Ok((false, format!("Unsupported threshold metric '{}'.", metric))),
            };
            let passed = match operator.as_str() {
                "gte" => observed >= *value,
                "lte" => observed <= *value,
                _ => false,
            };
            Ok((passed, format!("Observed threshold metric is {:.2}.", observed)))
        }
    }
}

fn estimate_gas_usd(action: &StrategyAction) -> f64 {
    match action {
        StrategyAction::AlertOnly { .. } => 0.0,
        StrategyAction::DcaBuy { .. } => 0.50,
        StrategyAction::RebalanceToTarget { .. } => 1.0,
        StrategyAction::FlowScheduled { .. } => 0.25,
        StrategyAction::FlowDcaBuy { .. } => 0.60,
        StrategyAction::FlowRebalance { .. } => 1.10,
        StrategyAction::FlowFlashLoanArbitrage { .. } => 1.50,
    }
}

fn evaluate_conditions(
    strategy: &ActiveStrategy,
    plan: &CompiledStrategyPlan,
    ctx: &EvalContext,
) -> (bool, Vec<StrategyConditionPreview>) {
    let mut passed = true;
    let mut previews = Vec::new();
    for condition in &plan.conditions {
        let (condition_passed, code, message) = match condition {
            StrategyCondition::PortfolioFloor { min_portfolio_usd } => (
                ctx.total_portfolio_usd >= *min_portfolio_usd,
                "portfolio_floor",
                format!(
                    "Portfolio value {:.2} vs minimum {:.2}.",
                    ctx.total_portfolio_usd, min_portfolio_usd
                ),
            ),
            StrategyCondition::MaxGas { max_gas_usd } => (
                estimate_gas_usd(&plan.action) <= *max_gas_usd,
                "max_gas",
                format!(
                    "Estimated gas {:.2} vs maximum {:.2}.",
                    estimate_gas_usd(&plan.action),
                    max_gas_usd
                ),
            ),
            StrategyCondition::MaxSlippage { max_slippage_bps } => (
                plan.normalized_guardrails
                    .max_slippage_bps
                    .unwrap_or(50)
                    <= *max_slippage_bps,
                "max_slippage",
                format!(
                    "Configured slippage {} bps vs maximum {} bps.",
                    plan.normalized_guardrails.max_slippage_bps.unwrap_or(50),
                    max_slippage_bps
                ),
            ),
            StrategyCondition::WalletAssetAvailable { symbol, min_amount } => {
                let balance = ctx
                    .tokens
                    .iter()
                    .filter(|token| token.symbol.eq_ignore_ascii_case(symbol))
                    .map(|token| parse_balance(&token.balance))
                    .sum::<f64>();
                (
                    balance >= *min_amount,
                    "wallet_asset_available",
                    format!("Available balance {:.6} {}.", balance, symbol),
                )
            }
            StrategyCondition::Cooldown { cooldown_seconds } => {
                let window = (*cooldown_seconds).min(i64::MAX as u64) as i64;
                let ready = strategy
                    .last_run_at
                    .map(|last_run| ctx.now - last_run >= window)
                    .unwrap_or(true);
                (
                    ready,
                    "cooldown",
                    format!("Cooldown window is {} seconds.", cooldown_seconds),
                )
            }
            StrategyCondition::DriftMinimum { min_drift_pct } => {
                let targets: Vec<TargetAllocationSpec> = match &plan.action {
                    StrategyAction::RebalanceToTarget {
                        target_allocations, ..
                    } => target_allocations.clone(),
                    StrategyAction::FlowScheduled {
                        handler_params, ..
                    } => serde_json::from_value(
                        handler_params
                            .get("targetAllocations")
                            .cloned()
                            .unwrap_or_else(|| serde_json::json!([])),
                    )
                    .unwrap_or_default(),
                    _ => Vec::new(),
                };
                let drift = compute_max_observed_drift_pct(ctx, &targets);
                (
                    drift >= *min_drift_pct,
                    "drift_minimum",
                    format!("Observed drift {:.2}% vs minimum {:.2}%.", drift, min_drift_pct),
                )
            }
        };
        passed &= condition_passed;
        previews.push(StrategyConditionPreview {
            code: code.to_string(),
            passed: condition_passed,
            message,
        });
    }
    (passed, previews)
}

fn determine_notional_usd(action: &StrategyAction, ctx: &EvalContext) -> f64 {
    match action {
        StrategyAction::DcaBuy { amount_usd, .. } => amount_usd.unwrap_or(0.0),
        StrategyAction::RebalanceToTarget {
            max_execution_usd, ..
        } => max_execution_usd.unwrap_or(ctx.total_portfolio_usd * 0.10),
        StrategyAction::AlertOnly { .. } => 0.0,
        StrategyAction::FlowScheduled { handler_params, .. } => handler_params
            .get("amountUsd")
            .and_then(|v| v.as_f64())
            .or_else(|| {
                handler_params
                    .get("maxExecutionUsd")
                    .and_then(|v| v.as_f64())
            })
            .unwrap_or(0.0),
        StrategyAction::FlowDcaBuy { amount, .. } => *amount,
        StrategyAction::FlowRebalance {
            max_execution_usd, ..
        } => max_execution_usd.unwrap_or(ctx.total_portfolio_usd * 0.10),
        StrategyAction::FlowFlashLoanArbitrage { loan_amount, .. } => *loan_amount,
    }
}

fn persist_strategy_execution(
    strategy_id: &str,
    status: &str,
    reason: Option<String>,
    evaluation_json: serde_json::Value,
    approval_id: Option<String>,
    tool_execution_id: Option<String>,
    now: i64,
) {
    let record = StrategyExecutionRecord {
        id: uuid::Uuid::new_v4().to_string(),
        strategy_id: strategy_id.to_string(),
        status: status.to_string(),
        reason,
        evaluation_json: evaluation_json.to_string(),
        approval_id,
        tool_execution_id,
        created_at: now,
    };
    let _ = local_db::insert_strategy_execution(&record);
}

fn create_approval_request(
    app: &AppHandle,
    strategy: &ActiveStrategy,
    plan: &CompiledStrategyPlan,
    payload: serde_json::Value,
    message: String,
    now: i64,
) -> Result<String, String> {
    let tool_name = match &plan.action {
        StrategyAction::DcaBuy { .. } => "execute_token_swap",
        StrategyAction::RebalanceToTarget { .. } => "rebalance_to_target",
        StrategyAction::AlertOnly { .. } => "alert_only",
        StrategyAction::FlowScheduled { .. } => "flow_schedule_transaction",
        StrategyAction::FlowDcaBuy { .. } | StrategyAction::FlowRebalance { .. } => {
            "flow_compose_defi_action"
        }
        StrategyAction::FlowFlashLoanArbitrage { .. } => "flow_compose_defi_action",
    };
    let approval = ApprovalRecord {
        id: uuid::Uuid::new_v4().to_string(),
        source: "heartbeat".to_string(),
        tool_name: tool_name.to_string(),
        kind: "strategy_action".to_string(),
        status: "pending".to_string(),
        payload_json: payload.to_string(),
        simulation_json: Some(
            serde_json::json!({
                "strategyId": strategy.id,
                "template": strategy.template,
                "supportedDirectExecution": false
            })
            .to_string(),
        ),
        policy_json: Some(strategy.approval_policy_json.clone()),
        message,
        expires_at: Some(now + 15 * 60),
        version: 1,
        strategy_id: Some(strategy.id.clone()),
        created_at: now,
        updated_at: now,
    };
    local_db::insert_approval_request(&approval).map_err(|err| err.to_string())?;
    audit::record("approval_created", "strategy", Some(&strategy.id), &approval);
    let _ = app.emit("approval_request_created", &approval);
    Ok(approval.id)
}

fn emit_alert(app: &AppHandle, strategy: &ActiveStrategy, title: String, message: String, now: i64) {
    let payload = serde_json::json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "title": title,
        "message": message,
        "strategyId": strategy.id,
        "timestamp": now,
    });
    let _ = app.emit("shadow_alert", &payload);
    let _ = app.emit("shadow_brief_ready", &payload);
}

pub fn evaluate_strategy(app: &AppHandle, strategy: &mut ActiveStrategy) -> Result<StrategyEvaluationResult, String> {
    let now = now_secs();
    strategy.last_evaluation_at = Some(now);
    let plan = load_compiled_plan(strategy)?;
    let ctx = build_context(app, now);
    let execution_policy = load_execution_policy(strategy);
    let normalized_guardrails: &StrategyGuardrails = &plan.normalized_guardrails;

    let (would_trigger, trigger_message) = evaluate_trigger(strategy, &plan, &ctx)?;
    if !would_trigger {
        strategy.next_run_at = strategy_scheduler::compute_next_run(&plan.trigger, now);
        strategy.last_execution_status = Some("skipped".to_string());
        strategy.last_execution_reason = Some(trigger_message.clone());
        local_db::upsert_strategy(strategy).map_err(|err| err.to_string())?;
        persist_strategy_execution(
            &strategy.id,
            "skipped",
            Some(trigger_message.clone()),
            serde_json::json!({ "trigger": trigger_message }),
            None,
            None,
            now,
        );
        return Ok(StrategyEvaluationResult {
            strategy_id: strategy.id.clone(),
            action: "trigger_not_due".to_string(),
            status: "skipped".to_string(),
            message: trigger_message,
            approval_id: None,
        });
    }

    let (conditions_passed, condition_results) = evaluate_conditions(strategy, &plan, &ctx);
    if !conditions_passed {
        let reason = "One or more strategy conditions blocked execution.".to_string();
        strategy.next_run_at = strategy_scheduler::compute_next_run(&plan.trigger, now);
        strategy.last_execution_status = Some("skipped".to_string());
        strategy.last_execution_reason = Some(reason.clone());
        local_db::upsert_strategy(strategy).map_err(|err| err.to_string())?;
        persist_strategy_execution(
            &strategy.id,
            "skipped",
            Some(reason.clone()),
            serde_json::json!({
                "trigger": trigger_message,
                "conditions": condition_results,
            }),
            None,
            None,
            now,
        );
        return Ok(StrategyEvaluationResult {
            strategy_id: strategy.id.clone(),
            action: "condition_blocked".to_string(),
            status: "skipped".to_string(),
            message: reason,
            approval_id: None,
        });
    }

    let notional_usd = determine_notional_usd(&plan.action, &ctx);
    if let Some(max_trade) = normalized_guardrails.max_per_trade_usd {
        if notional_usd > max_trade {
            strategy.failure_count += 1;
            strategy.disabled_reason = Some("strategy_limit_exceeded".to_string());
            strategy.status = "paused".to_string();
            strategy.last_execution_status = Some("failed".to_string());
            strategy.last_execution_reason = Some("Action exceeds max per trade guardrail.".to_string());
            local_db::upsert_strategy(strategy).map_err(|err| err.to_string())?;
            audit::record("strategy_paused", "strategy", Some(&strategy.id), &serde_json::json!({
                "reason": "max_per_trade_exceeded",
                "notionalUsd": notional_usd,
                "maxPerTradeUsd": max_trade,
            }));
            persist_strategy_execution(
                &strategy.id,
                "failed",
                Some("Action exceeds max per trade guardrail.".to_string()),
                serde_json::json!({ "notionalUsd": notional_usd }),
                None,
                None,
                now,
            );
            return Ok(StrategyEvaluationResult {
                strategy_id: strategy.id.clone(),
                action: "pause".to_string(),
                status: "paused".to_string(),
                message: "Strategy paused because it exceeded configured amount limits.".to_string(),
                approval_id: None,
            });
        }
    }

    if let Some(ref chains) = normalized_guardrails.allowed_chains {
        if !chains.is_empty() {
            let chain_ok = match &plan.action {
                StrategyAction::DcaBuy { chain, .. } => {
                    chains.iter().any(|c| c.eq_ignore_ascii_case(chain))
                }
                StrategyAction::RebalanceToTarget { chain, .. } => {
                    if chain.eq_ignore_ascii_case("multi_chain") {
                        true
                    } else {
                        chains.iter().any(|c| c.eq_ignore_ascii_case(chain))
                    }
                }
                StrategyAction::AlertOnly { .. } => true,
                StrategyAction::FlowScheduled { chain, .. } => {
                    chains.iter().any(|c| c.eq_ignore_ascii_case(chain))
                }
                StrategyAction::FlowDcaBuy { .. }
                | StrategyAction::FlowRebalance { .. }
                | StrategyAction::FlowFlashLoanArbitrage { .. } => chains.iter().any(|c| {
                    let x = c.to_ascii_lowercase();
                    x.contains("flow") && !x.contains("evm")
                }),
            };
            if !chain_ok {
                strategy.next_run_at = strategy_scheduler::compute_next_run(&plan.trigger, now);
                strategy.last_execution_status = Some("skipped".to_string());
                strategy.last_execution_reason = Some("Chain not in allowed list.".to_string());
                local_db::upsert_strategy(strategy).map_err(|err| err.to_string())?;
                persist_strategy_execution(
                    &strategy.id,
                    "skipped",
                    Some("Chain not allowed.".to_string()),
                    serde_json::json!({ "reason": "chain_allowlist" }),
                    None,
                    None,
                    now,
                );
                return Ok(StrategyEvaluationResult {
                    strategy_id: strategy.id.clone(),
                    action: "condition_blocked".to_string(),
                    status: "skipped".to_string(),
                    message: "Strategy chain is not in the allowed list.".to_string(),
                    approval_id: None,
                });
            }
        }
    }

    if let Some(min_pf) = normalized_guardrails.min_portfolio_usd {
        if ctx.total_portfolio_usd < min_pf {
            strategy.next_run_at = strategy_scheduler::compute_next_run(&plan.trigger, now);
            strategy.last_execution_status = Some("skipped".to_string());
            strategy.last_execution_reason = Some("Portfolio below minimum guardrail.".to_string());
            local_db::upsert_strategy(strategy).map_err(|err| err.to_string())?;
            persist_strategy_execution(
                &strategy.id,
                "skipped",
                Some("min_portfolio_usd".to_string()),
                serde_json::json!({ "totalUsd": ctx.total_portfolio_usd }),
                None,
                None,
                now,
            );
            return Ok(StrategyEvaluationResult {
                strategy_id: strategy.id.clone(),
                action: "condition_blocked".to_string(),
                status: "skipped".to_string(),
                message: "Portfolio value is below the configured minimum.".to_string(),
                approval_id: None,
            });
        }
    }

    strategy.next_run_at = strategy_scheduler::compute_next_run(&plan.trigger, now);
    strategy.last_run_at = Some(now);
    strategy.failure_count = 0;

    match &plan.action {
        StrategyAction::AlertOnly {
            title,
            message_template,
            ..
        } => {
            emit_alert(app, strategy, title.clone(), message_template.clone(), now);
            strategy.last_execution_status = Some("succeeded".to_string());
            strategy.last_execution_reason = Some("Alert emitted.".to_string());
            local_db::upsert_strategy(strategy).map_err(|err| err.to_string())?;
            persist_strategy_execution(
                &strategy.id,
                "succeeded",
                Some("Alert emitted.".to_string()),
                serde_json::json!({
                    "trigger": trigger_message,
                    "conditions": condition_results,
                    "action": "alert_only",
                }),
                None,
                None,
                now,
            );
            Ok(StrategyEvaluationResult {
                strategy_id: strategy.id.clone(),
                action: "monitor_event_emitted".to_string(),
                status: "ok".to_string(),
                message: "Alert emitted successfully.".to_string(),
                approval_id: None,
            })
        }
        StrategyAction::DcaBuy {
            chain,
            from_symbol,
            to_symbol,
            amount_usd,
            amount_token,
        } => {
            if strategy.mode == "monitor_only" {
                emit_alert(
                    app,
                    strategy,
                    format!("Monitor-only DCA: {}", strategy.name),
                    format!("DCA conditions met for {} -> {}.", from_symbol, to_symbol),
                    now,
                );
                strategy.last_execution_status = Some("succeeded".to_string());
                strategy.last_execution_reason = Some("Monitor-only notification emitted.".to_string());
                local_db::upsert_strategy(strategy).map_err(|err| err.to_string())?;
                persist_strategy_execution(
                    &strategy.id,
                    "succeeded",
                    Some("Monitor-only notification emitted.".to_string()),
                    serde_json::json!({ "action": "dca_buy", "monitorOnly": true }),
                    None,
                    None,
                    now,
                );
                return Ok(StrategyEvaluationResult {
                    strategy_id: strategy.id.clone(),
                    action: "monitor_event_emitted".to_string(),
                    status: "ok".to_string(),
                    message: "Monitor-only DCA signal emitted.".to_string(),
                    approval_id: None,
                });
            }

            let approval_required = strategy.mode == "approval_required"
                || !execution_policy.enabled
                || !execution_policy.fallback_to_approval;
            let payload = serde_json::json!({
                "type": "dca_buy",
                "chain": chain,
                "fromSymbol": from_symbol,
                "toSymbol": to_symbol,
                "amountUsd": amount_usd,
                "amountToken": amount_token,
                "strategyId": strategy.id,
            });
            let approval_id = create_approval_request(
                app,
                strategy,
                &plan,
                payload,
                if strategy.mode == "pre_authorized" && execution_policy.enabled {
                    "Direct execution adapter is unavailable, so SHADOW downgraded this strategy run to approval-required.".to_string()
                } else {
                    format!("Strategy '{}' is ready to execute a DCA trade.", strategy.name)
                },
                now,
            )?;
            strategy.last_execution_status = Some("approval_created".to_string());
            strategy.last_execution_reason = Some("Approval created for DCA trade.".to_string());
            local_db::upsert_strategy(strategy).map_err(|err| err.to_string())?;
            persist_strategy_execution(
                &strategy.id,
                "approval_created",
                Some("Approval created for DCA trade.".to_string()),
                serde_json::json!({
                    "trigger": trigger_message,
                    "conditions": condition_results,
                    "mode": strategy.mode,
                    "approvalRequired": approval_required,
                }),
                Some(approval_id.clone()),
                None,
                now,
            );
            Ok(StrategyEvaluationResult {
                strategy_id: strategy.id.clone(),
                action: "approval_request".to_string(),
                status: "ok".to_string(),
                message: "Approval request created for DCA trade.".to_string(),
                approval_id: Some(approval_id),
            })
        }
        StrategyAction::RebalanceToTarget {
            chain,
            threshold_pct,
            target_allocations,
            max_execution_usd,
        } => {
            if strategy.mode == "monitor_only" {
                let observed_drift = compute_max_observed_drift_pct(&ctx, target_allocations);
                emit_alert(
                    app,
                    strategy,
                    format!("Monitor-only rebalance: {}", strategy.name),
                    format!(
                        "Drift {:.2}% vs threshold {:.2}% on {}.",
                        observed_drift, threshold_pct, chain
                    ),
                    now,
                );
                strategy.last_execution_status = Some("succeeded".to_string());
                strategy.last_execution_reason =
                    Some("Monitor-only rebalance notification emitted.".to_string());
                local_db::upsert_strategy(strategy).map_err(|err| err.to_string())?;
                persist_strategy_execution(
                    &strategy.id,
                    "succeeded",
                    Some("Monitor-only rebalance signal.".to_string()),
                    serde_json::json!({ "action": "rebalance_to_target", "monitorOnly": true }),
                    None,
                    None,
                    now,
                );
                return Ok(StrategyEvaluationResult {
                    strategy_id: strategy.id.clone(),
                    action: "monitor_event_emitted".to_string(),
                    status: "ok".to_string(),
                    message: "Monitor-only rebalance signal emitted.".to_string(),
                    approval_id: None,
                });
            }

            let observed_drift = compute_max_observed_drift_pct(&ctx, target_allocations);
            if observed_drift < *threshold_pct {
                strategy.last_execution_status = Some("skipped".to_string());
                strategy.last_execution_reason = Some("Observed drift is below threshold.".to_string());
                local_db::upsert_strategy(strategy).map_err(|err| err.to_string())?;
                persist_strategy_execution(
                    &strategy.id,
                    "skipped",
                    Some("Observed drift is below threshold.".to_string()),
                    serde_json::json!({ "observedDriftPct": observed_drift }),
                    None,
                    None,
                    now,
                );
                return Ok(StrategyEvaluationResult {
                    strategy_id: strategy.id.clone(),
                    action: "condition_blocked".to_string(),
                    status: "skipped".to_string(),
                    message: "Observed drift is below threshold.".to_string(),
                    approval_id: None,
                });
            }
            let payload = serde_json::json!({
                "type": "rebalance_to_target",
                "chain": chain,
                "thresholdPct": threshold_pct,
                "maxExecutionUsd": max_execution_usd,
                "targetAllocations": target_allocations,
                "strategyId": strategy.id,
                "observedDriftPct": observed_drift,
            });
            let approval_id = create_approval_request(
                app,
                strategy,
                &plan,
                payload,
                "Rebalance requires review because only approval-preview execution is currently available.".to_string(),
                now,
            )?;
            strategy.last_execution_status = Some("approval_created".to_string());
            strategy.last_execution_reason = Some("Approval created for rebalance.".to_string());
            local_db::upsert_strategy(strategy).map_err(|err| err.to_string())?;
            persist_strategy_execution(
                &strategy.id,
                "approval_created",
                Some("Approval created for rebalance.".to_string()),
                serde_json::json!({
                    "trigger": trigger_message,
                    "conditions": condition_results,
                    "observedDriftPct": observed_drift,
                }),
                Some(approval_id.clone()),
                None,
                now,
            );
            Ok(StrategyEvaluationResult {
                strategy_id: strategy.id.clone(),
                action: "approval_request".to_string(),
                status: "ok".to_string(),
                message: "Approval request created for rebalance.".to_string(),
                approval_id: Some(approval_id),
            })
        }
        StrategyAction::FlowScheduled {
            chain,
            handler_type,
            cron_expression,
            one_shot_timestamp,
            handler_params,
        } => {
            if strategy.mode == "monitor_only" {
                emit_alert(
                    app,
                    strategy,
                    format!("Monitor-only Flow schedule: {}", strategy.name),
                    format!(
                        "Flow on-chain intent ({handler_type}) on {chain}. Params recorded locally."
                    ),
                    now,
                );
                strategy.last_execution_status = Some("succeeded".to_string());
                strategy.last_execution_reason =
                    Some("Monitor-only Flow schedule signal emitted.".to_string());
                local_db::upsert_strategy(strategy).map_err(|err| err.to_string())?;
                persist_strategy_execution(
                    &strategy.id,
                    "succeeded",
                    Some("Monitor-only Flow schedule.".to_string()),
                    serde_json::json!({ "action": "flow_scheduled", "monitorOnly": true }),
                    None,
                    None,
                    now,
                );
                return Ok(StrategyEvaluationResult {
                    strategy_id: strategy.id.clone(),
                    action: "monitor_event_emitted".to_string(),
                    status: "ok".to_string(),
                    message: "Monitor-only Flow schedule signal emitted.".to_string(),
                    approval_id: None,
                });
            }
            let intent = serde_json::json!({
                "kind": "flow_scheduled",
                "chain": chain,
                "handlerType": handler_type,
                "cronExpression": cron_expression,
                "oneShotTimestamp": one_shot_timestamp,
                "handlerParams": handler_params,
            });
            let payload = serde_json::json!({
                "type": "flow_schedule",
                "strategyId": strategy.id,
                "intent": intent,
            });
            let approval_id = create_approval_request(
                app,
                strategy,
                &plan,
                payload,
                "Flow Cadence on-chain schedule requires your approval (signing uses unlocked session)."
                    .to_string(),
                now,
            )?;
            strategy.last_execution_status = Some("approval_created".to_string());
            strategy.last_execution_reason = Some("Approval created for Flow schedule.".to_string());
            local_db::upsert_strategy(strategy).map_err(|err| err.to_string())?;
            persist_strategy_execution(
                &strategy.id,
                "approval_created",
                Some("Flow schedule approval.".to_string()),
                serde_json::json!({
                    "trigger": trigger_message,
                    "conditions": condition_results,
                    "flow": true,
                }),
                Some(approval_id.clone()),
                None,
                now,
            );
            Ok(StrategyEvaluationResult {
                strategy_id: strategy.id.clone(),
                action: "approval_request".to_string(),
                status: "ok".to_string(),
                message: "Approval request created for Flow on-chain schedule.".to_string(),
                approval_id: Some(approval_id),
            })
        }
        StrategyAction::FlowDcaBuy {
            from_vault,
            to_vault,
            amount,
            swapper_protocol,
            max_slippage_bps,
        } => {
            let payload = serde_json::json!({
                "kind": "flow_dca",
                "strategyId": strategy.id,
                "fromVault": from_vault,
                "toVault": to_vault,
                "amount": amount,
                "swapperProtocol": swapper_protocol,
                "maxSlippageBps": max_slippage_bps,
            });
            let approval_id = create_approval_request(
                app,
                strategy,
                &plan,
                payload,
                "Flow Actions DCA composition requires approval.".to_string(),
                now,
            )?;
            strategy.last_execution_status = Some("approval_created".to_string());
            strategy.last_execution_reason = Some("Flow DeFi composition approval.".to_string());
            local_db::upsert_strategy(strategy).map_err(|err| err.to_string())?;
            persist_strategy_execution(
                &strategy.id,
                "approval_created",
                Some("flow_compose_defi_action".to_string()),
                serde_json::json!({ "trigger": trigger_message }),
                Some(approval_id.clone()),
                None,
                now,
            );
            Ok(StrategyEvaluationResult {
                strategy_id: strategy.id.clone(),
                action: "approval_request".to_string(),
                status: "ok".to_string(),
                message: "Approval created for Flow Actions DCA preview.".to_string(),
                approval_id: Some(approval_id),
            })
        }
        StrategyAction::FlowRebalance {
            target_allocations,
            swapper_protocol,
            max_execution_usd,
        } => {
            let payload = serde_json::json!({
                "kind": "flow_rebalance",
                "strategyId": strategy.id,
                "targetAllocations": target_allocations,
                "swapperProtocol": swapper_protocol,
                "maxExecutionUsd": max_execution_usd,
            });
            let approval_id = create_approval_request(
                app,
                strategy,
                &plan,
                payload,
                "Flow Actions rebalance composition requires approval.".to_string(),
                now,
            )?;
            strategy.last_execution_status = Some("approval_created".to_string());
            strategy.last_execution_reason = Some("Flow rebalance approval.".to_string());
            local_db::upsert_strategy(strategy).map_err(|err| err.to_string())?;
            persist_strategy_execution(
                &strategy.id,
                "approval_created",
                Some("flow_compose_defi_action".to_string()),
                serde_json::json!({ "trigger": trigger_message }),
                Some(approval_id.clone()),
                None,
                now,
            );
            Ok(StrategyEvaluationResult {
                strategy_id: strategy.id.clone(),
                action: "approval_request".to_string(),
                status: "ok".to_string(),
                message: "Approval created for Flow Actions rebalance preview.".to_string(),
                approval_id: Some(approval_id),
            })
        }
        StrategyAction::FlowFlashLoanArbitrage {
            flasher_protocol,
            loan_token,
            loan_amount,
            swap_route,
        } => {
            let payload = serde_json::json!({
                "kind": "flow_flash",
                "strategyId": strategy.id,
                "flasherProtocol": flasher_protocol,
                "loanToken": loan_token,
                "loanAmount": loan_amount,
                "swapRoute": swap_route,
            });
            let approval_id = create_approval_request(
                app,
                strategy,
                &plan,
                payload,
                "Flow flash-loan route requires explicit approval.".to_string(),
                now,
            )?;
            strategy.last_execution_status = Some("approval_created".to_string());
            strategy.last_execution_reason = Some("Flow flash approval.".to_string());
            local_db::upsert_strategy(strategy).map_err(|err| err.to_string())?;
            persist_strategy_execution(
                &strategy.id,
                "approval_created",
                Some("flow_compose_defi_action".to_string()),
                serde_json::json!({ "trigger": trigger_message }),
                Some(approval_id.clone()),
                None,
                now,
            );
            Ok(StrategyEvaluationResult {
                strategy_id: strategy.id.clone(),
                action: "approval_request".to_string(),
                status: "ok".to_string(),
                message: "Approval created for Flow flash composition preview.".to_string(),
                approval_id: Some(approval_id),
            })
        }
    }
}
