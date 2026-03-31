//! Tauri commands for typed strategy draft compile, persist, and history.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::services::apps::filecoin;
use crate::services::audit;
use crate::services::local_db::{self, ActiveStrategy};
use crate::services::strategy_compiler::compile_draft;
use crate::services::strategy_types::{
    CompiledStrategyPlan, EvaluationPreview, StrategyAction, StrategyDraft, StrategyMode,
    StrategySimulationResult, StrategyExecutionRecordIpc,
};

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyCompileDraftInput {
    pub draft: StrategyDraft,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyCreateFromDraftInput {
    pub draft: StrategyDraft,
    pub status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyUpdateFromDraftInput {
    pub id: String,
    pub draft: StrategyDraft,
    pub status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyGetInput {
    pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyExecutionHistoryInput {
    pub strategy_id: Option<String>,
    pub limit: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyDetailResult {
    pub strategy: ActiveStrategy,
    pub draft: Option<StrategyDraft>,
    pub plan: Option<CompiledStrategyPlan>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyPersistResult {
    pub strategy: ActiveStrategy,
}

fn summarize_action(action: &StrategyAction) -> String {
    match action {
        StrategyAction::DcaBuy {
            from_symbol,
            to_symbol,
            amount_usd,
            chain,
            ..
        } => {
            format!(
                "DCA on {}: {} -> {} (~${:.2})",
                chain,
                from_symbol,
                to_symbol,
                amount_usd.unwrap_or(0.0)
            )
        }
        StrategyAction::RebalanceToTarget {
            chain,
            threshold_pct,
            ..
        } => {
            format!("Rebalance on {} when drift >= {:.2}%", chain, threshold_pct)
        }
        StrategyAction::AlertOnly { title, .. } => format!("Alert: {}", title),
        StrategyAction::FlowScheduled {
            chain,
            handler_type,
            cron_expression,
            ..
        } => {
            if let Some(c) = cron_expression {
                format!("Flow on-chain schedule ({handler_type}) on {chain}, cron {c}")
            } else {
                format!("Flow on-chain schedule ({handler_type}) on {chain}")
            }
        }
        StrategyAction::FlowDcaBuy {
            from_vault,
            to_vault,
            amount,
            swapper_protocol,
            ..
        } => {
            format!(
                "Flow Actions DCA {:.4} via {} ({} -> {})",
                amount, swapper_protocol, from_vault, to_vault
            )
        }
        StrategyAction::FlowRebalance {
            swapper_protocol, ..
        } => {
            format!("Flow Actions rebalance via {}", swapper_protocol)
        }
        StrategyAction::FlowFlashLoanArbitrage {
            flasher_protocol,
            loan_token,
            loan_amount,
            ..
        } => {
            format!(
                "Flow flash loan {:.4} {} via {}",
                loan_amount, loan_token, flasher_protocol
            )
        }
    }
}

fn build_simulation(draft: &StrategyDraft, plan: &CompiledStrategyPlan) -> StrategySimulationResult {
    let preview = EvaluationPreview {
        would_trigger: plan.valid,
        condition_results: vec![],
        execution_mode: draft.mode.clone(),
        expected_action_summary: summarize_action(&plan.action),
    };
    let message = if plan.valid {
        "Strategy compiles successfully.".to_string()
    } else {
        "Strategy has validation errors; fix before activation.".to_string()
    };
    StrategySimulationResult {
        strategy_id: draft.id.clone(),
        valid: plan.valid,
        plan: Some(plan.clone()),
        evaluation_preview: preview,
        message,
    }
}

fn normalize_status(s: &str) -> Result<String, String> {
    match s.trim() {
        "draft" | "active" | "paused" => Ok(s.trim().to_string()),
        _ => Err("Invalid strategy status.".to_string()),
    }
}

fn draft_to_active(
    draft: StrategyDraft,
    id: &str,
    status: &str,
    version: i64,
    existing: Option<ActiveStrategy>,
) -> Result<ActiveStrategy, String> {
    let compiled = compile_draft(&draft, id, version);
    let status_norm = normalize_status(status)?;
    if status_norm == "active" && !compiled.valid {
        return Err("Cannot activate an invalid strategy.".to_string());
    }
    if draft.mode == StrategyMode::PreAuthorized && !compiled.valid {
        return Err("Pre-authorized mode requires a valid compiled plan.".to_string());
    }

    let draft_graph_json = serde_json::to_string(&draft).map_err(|e| e.to_string())?;
    let compiled_plan_json = serde_json::to_string(&compiled).map_err(|e| e.to_string())?;
    let validation_state = if compiled.valid { "valid" } else { "invalid" };
    let sim = build_simulation(&draft, &compiled);
    let last_simulation_json = serde_json::to_string(&sim).ok();

    let trigger_json = serde_json::to_string(&compiled.trigger).map_err(|e| e.to_string())?;
    let action_json = serde_json::to_string(&compiled.action).map_err(|e| e.to_string())?;
    let guardrails_json =
        serde_json::to_string(&draft.guardrails).map_err(|e| e.to_string())?;
    let approval_policy_json =
        serde_json::to_string(&draft.approval_policy).map_err(|e| e.to_string())?;
    let execution_policy_json =
        serde_json::to_string(&draft.execution_policy).map_err(|e| e.to_string())?;

    let template_str = match draft.template {
        crate::services::strategy_types::StrategyTemplate::DcaBuy => "dca_buy",
        crate::services::strategy_types::StrategyTemplate::RebalanceToTarget => {
            "rebalance_to_target"
        }
        crate::services::strategy_types::StrategyTemplate::AlertOnly => "alert_only",
    };

    let mode_str = match draft.mode {
        StrategyMode::MonitorOnly => "monitor_only",
        StrategyMode::ApprovalRequired => "approval_required",
        StrategyMode::PreAuthorized => "pre_authorized",
    };

    let now = now_secs();
    let next_run = if status_norm == "active" && compiled.valid {
        crate::services::strategy_scheduler::compute_next_run(&compiled.trigger, now)
    } else {
        None
    };
    let is_draft_status = status_norm == "draft";
    let disabled_reason = if compiled.valid || is_draft_status {
        None
    } else {
        Some("invalid_plan".to_string())
    };

    Ok(ActiveStrategy {
        id: id.to_string(),
        name: draft.name.trim().to_string(),
        summary: draft.summary.clone(),
        status: status_norm,
        template: template_str.to_string(),
        mode: mode_str.to_string(),
        version,
        trigger_json,
        action_json,
        guardrails_json,
        draft_graph_json,
        compiled_plan_json,
        validation_state: validation_state.to_string(),
        last_simulation_json,
        last_execution_status: existing
            .as_ref()
            .and_then(|e| e.last_execution_status.clone()),
        last_execution_reason: existing
            .as_ref()
            .and_then(|e| e.last_execution_reason.clone()),
        approval_policy_json,
        execution_policy_json,
        failure_count: existing.as_ref().map(|e| e.failure_count).unwrap_or(0),
        last_evaluation_at: existing.as_ref().and_then(|e| e.last_evaluation_at),
        disabled_reason,
        last_run_at: existing.as_ref().and_then(|e| e.last_run_at),
        next_run_at: next_run.or_else(|| existing.as_ref().and_then(|e| e.next_run_at)),
        updated_at: Some(now),
    })
}

#[tauri::command]
pub async fn strategy_compile_draft(
    input: StrategyCompileDraftInput,
) -> Result<StrategySimulationResult, String> {
    let preview_id = input
        .draft
        .id
        .clone()
        .unwrap_or_else(|| "preview".to_string());
    let plan = compile_draft(&input.draft, &preview_id, 0);
    Ok(build_simulation(&input.draft, &plan))
}

#[tauri::command]
pub async fn strategy_create_from_draft(
    app: AppHandle,
    input: StrategyCreateFromDraftInput,
) -> Result<StrategyPersistResult, String> {
    if input.draft.name.trim().len() < 2 {
        return Err("Strategy name is too short.".to_string());
    }
    let id = uuid::Uuid::new_v4().to_string();
    let strategy = draft_to_active(input.draft, &id, &input.status, 1, None)?;
    local_db::upsert_strategy(&strategy).map_err(|e| e.to_string())?;
    audit::record("strategy_created", "strategy", Some(&strategy.id), &strategy);
    filecoin::spawn_filecoin_snapshot_upload(&app);
    Ok(StrategyPersistResult { strategy })
}

#[tauri::command]
pub async fn strategy_update_from_draft(
    app: AppHandle,
    input: StrategyUpdateFromDraftInput,
) -> Result<StrategyPersistResult, String> {
    let existing = local_db::get_strategy(&input.id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Strategy not found.".to_string())?;
    if input.draft.name.trim().len() < 2 {
        return Err("Strategy name is too short.".to_string());
    }
    let next_version = existing.version.saturating_add(1);
    let strategy = draft_to_active(
        input.draft,
        &input.id,
        &input.status,
        next_version,
        Some(existing),
    )?;
    local_db::upsert_strategy(&strategy).map_err(|e| e.to_string())?;
    audit::record("strategy_updated", "strategy", Some(&strategy.id), &strategy);
    filecoin::spawn_filecoin_snapshot_upload(&app);
    Ok(StrategyPersistResult { strategy })
}

#[tauri::command]
pub async fn strategy_get(input: StrategyGetInput) -> Result<StrategyDetailResult, String> {
    let strategy = local_db::get_strategy(&input.id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Strategy not found.".to_string())?;
    let draft: Option<StrategyDraft> =
        serde_json::from_str(&strategy.draft_graph_json).ok();
    let plan: Option<CompiledStrategyPlan> =
        serde_json::from_str(&strategy.compiled_plan_json).ok();
    Ok(StrategyDetailResult {
        strategy,
        draft,
        plan,
    })
}

#[tauri::command]
pub async fn strategy_get_execution_history(
    input: StrategyExecutionHistoryInput,
) -> Result<Vec<StrategyExecutionRecordIpc>, String> {
    let limit = input.limit.unwrap_or(50).min(500);
    let rows = local_db::get_strategy_executions(
        input.strategy_id.as_deref(),
        limit,
    )
    .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|r| StrategyExecutionRecordIpc {
            id: r.id,
            strategy_id: r.strategy_id,
            status: r.status,
            reason: r.reason,
            approval_id: r.approval_id,
            tool_execution_id: r.tool_execution_id,
            created_at: r.created_at,
        })
        .collect())
}
