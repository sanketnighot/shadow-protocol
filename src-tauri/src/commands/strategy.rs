use serde::{Deserialize, Serialize};

use crate::services::audit;
use crate::services::local_db::{
    self, get_strategy as db_get_strategy, upsert_strategy, ActiveStrategy, StrategyExecutionRecord,
};
use crate::services::strategy_compiler::{compile_draft, infer_template_from_legacy};
use crate::services::strategy_scheduler;
use crate::services::strategy_types::{
    CompiledStrategyPlan, StrategyDraft, StrategySimulationResult,
};

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyDraftInput {
    pub id: Option<String>,
    pub name: String,
    pub summary: Option<String>,
    pub template: String,
    pub mode: String,
    pub nodes: Vec<crate::services::strategy_types::StrategyDraftNode>,
    pub edges: Vec<crate::services::strategy_types::StrategyDraftEdge>,
    pub guardrails: crate::services::strategy_types::StrategyGuardrails,
    pub approval_policy: crate::services::strategy_types::StrategyApprovalPolicy,
    pub execution_policy: crate::services::strategy_types::StrategyExecutionPolicy,
}

impl From<StrategyDraftInput> for StrategyDraft {
    fn from(value: StrategyDraftInput) -> Self {
        StrategyDraft {
            id: value.id,
            name: value.name,
            summary: value.summary,
            template: value.template,
            mode: value.mode,
            nodes: value.nodes,
            edges: value.edges,
            guardrails: value.guardrails,
            approval_policy: value.approval_policy,
            execution_policy: value.execution_policy,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyCompileDraftInput {
    pub draft: StrategyDraftInput,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyCreateFromDraftInput {
    pub draft: StrategyDraftInput,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyUpdateFromDraftInput {
    pub id: String,
    pub draft: StrategyDraftInput,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyGetInput {
    pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetStrategyExecutionsInput {
    pub strategy_id: Option<String>,
    pub limit: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyResult {
    pub strategy: ActiveStrategy,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyDetailResult {
    pub strategy: ActiveStrategy,
    pub draft: Option<StrategyDraft>,
    pub plan: Option<CompiledStrategyPlan>,
}

fn extract_legacy_action_json(draft: &StrategyDraft) -> String {
    draft
        .nodes
        .iter()
        .find(|node| node.node_type == crate::services::strategy_types::StrategyNodeType::Action)
        .map(|node| node.data.to_string())
        .unwrap_or_else(|| "{}".to_string())
}

fn extract_legacy_trigger_json(draft: &StrategyDraft) -> String {
    draft
        .nodes
        .iter()
        .find(|node| node.node_type == crate::services::strategy_types::StrategyNodeType::Trigger)
        .map(|node| node.data.to_string())
        .unwrap_or_else(|| "{}".to_string())
}

fn build_active_strategy(
    strategy_id: String,
    draft: StrategyDraft,
    previous: Option<&ActiveStrategy>,
    requested_status: Option<String>,
) -> Result<(ActiveStrategy, StrategySimulationResult), String> {
    let version = previous.map(|item| item.version + 1).unwrap_or(1);
    let simulation = compile_draft(strategy_id.clone(), version, &draft);
    let desired_status = requested_status.unwrap_or_else(|| "draft".to_string());

    if desired_status == "active" && !simulation.valid {
        return Err("Strategy must validate successfully before activation.".to_string());
    }

    let plan = simulation.plan.clone();
    let now = now_secs();
    let next_run_at = if desired_status == "active" && simulation.valid {
        plan.as_ref()
            .and_then(|compiled| strategy_scheduler::compute_next_run(&compiled.trigger, now))
            .or(Some(now))
    } else {
        None
    };

    let strategy = ActiveStrategy {
        id: strategy_id,
        name: draft.name.trim().to_string(),
        summary: draft.summary.clone().filter(|item| !item.trim().is_empty()),
        status: if simulation.valid {
            desired_status
        } else {
            "draft".to_string()
        },
        template: draft.template.clone(),
        mode: draft.mode.clone(),
        version,
        trigger_json: extract_legacy_trigger_json(&draft),
        action_json: extract_legacy_action_json(&draft),
        guardrails_json: serde_json::to_string(&draft.guardrails).map_err(|err| err.to_string())?,
        draft_graph_json: serde_json::to_string(&draft).map_err(|err| err.to_string())?,
        compiled_plan_json: serde_json::to_string(&plan).map_err(|err| err.to_string())?,
        validation_state: if simulation.valid {
            "valid".to_string()
        } else {
            "invalid".to_string()
        },
        last_simulation_json: Some(serde_json::to_string(&simulation).map_err(|err| err.to_string())?),
        last_execution_status: previous.and_then(|item| item.last_execution_status.clone()),
        last_execution_reason: previous.and_then(|item| item.last_execution_reason.clone()),
        approval_policy_json: serde_json::to_string(&draft.approval_policy).map_err(|err| err.to_string())?,
        execution_policy_json: serde_json::to_string(&draft.execution_policy).map_err(|err| err.to_string())?,
        failure_count: previous.map(|item| item.failure_count).unwrap_or(0),
        last_evaluation_at: previous.and_then(|item| item.last_evaluation_at),
        disabled_reason: if simulation.valid {
            previous.and_then(|item| item.disabled_reason.clone())
        } else {
            Some("validation_failed".to_string())
        },
        last_run_at: previous.and_then(|item| item.last_run_at),
        next_run_at,
        updated_at: Some(now),
    };

    Ok((strategy, simulation))
}

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
    let trigger: serde_json::Value = serde_json::from_str(trigger_json).unwrap_or_else(|_| serde_json::json!({}));
    let action: serde_json::Value = serde_json::from_str(action_json).unwrap_or_else(|_| serde_json::json!({}));
    let template = infer_template_from_legacy(&trigger, &action);
    let draft = StrategyDraft {
        id: Some(id.to_string()),
        name: name.to_string(),
        summary,
        template,
        mode: mode.to_string(),
        nodes: vec![
            crate::services::strategy_types::StrategyDraftNode {
                id: "trigger-legacy".to_string(),
                node_type: crate::services::strategy_types::StrategyNodeType::Trigger,
                position: crate::services::strategy_types::StrategyNodePosition { x: 0.0, y: 60.0 },
                data: trigger,
            },
            crate::services::strategy_types::StrategyDraftNode {
                id: "action-legacy".to_string(),
                node_type: crate::services::strategy_types::StrategyNodeType::Action,
                position: crate::services::strategy_types::StrategyNodePosition { x: 320.0, y: 60.0 },
                data: action,
            },
        ],
        edges: vec![crate::services::strategy_types::StrategyDraftEdge {
            id: "edge-legacy".to_string(),
            source: "trigger-legacy".to_string(),
            target: "action-legacy".to_string(),
        }],
        guardrails: serde_json::from_str(guardrails_json).unwrap_or_default(),
        approval_policy: serde_json::from_str(approval_policy_json).unwrap_or_default(),
        execution_policy: serde_json::from_str(execution_policy_json).unwrap_or_default(),
    };
    let (strategy, _) = build_active_strategy(id.to_string(), draft.clone(), None, Some("draft".to_string()))
        .unwrap_or_else(|_| {
            (
                ActiveStrategy {
                    id: id.to_string(),
                    name: name.to_string(),
                    summary: None,
                    status: "draft".to_string(),
                    template: "alert_only".to_string(),
                    mode: mode.to_string(),
                    version: 1,
                    trigger_json: trigger_json.to_string(),
                    action_json: action_json.to_string(),
                    guardrails_json: guardrails_json.to_string(),
                    draft_graph_json: "{}".to_string(),
                    compiled_plan_json: "null".to_string(),
                    validation_state: "invalid".to_string(),
                    last_simulation_json: None,
                    last_execution_status: None,
                    last_execution_reason: Some("legacy_import_failed".to_string()),
                    approval_policy_json: approval_policy_json.to_string(),
                    execution_policy_json: execution_policy_json.to_string(),
                    failure_count: 0,
                    last_evaluation_at: None,
                    disabled_reason: Some("legacy_import_failed".to_string()),
                    last_run_at: None,
                    next_run_at: None,
                    updated_at: Some(now_secs()),
                },
                compile_draft(id.to_string(), 1, &draft),
            )
        });
    strategy
}

#[tauri::command]
pub async fn strategy_compile_draft(
    input: StrategyCompileDraftInput,
) -> Result<StrategySimulationResult, String> {
    let draft: StrategyDraft = input.draft.into();
    let strategy_id = draft
        .id
        .clone()
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    Ok(compile_draft(strategy_id, 1, &draft))
}

#[tauri::command]
pub async fn strategy_create_from_draft(
    input: StrategyCreateFromDraftInput,
) -> Result<StrategyResult, String> {
    let draft: StrategyDraft = input.draft.into();
    let strategy_id = draft
        .id
        .clone()
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let (strategy, simulation) = build_active_strategy(strategy_id.clone(), draft, None, input.status)?;
    upsert_strategy(&strategy).map_err(|err| err.to_string())?;
    audit::record("strategy_saved_from_draft", "strategy", Some(&strategy.id), &simulation);
    Ok(StrategyResult { strategy })
}

#[tauri::command]
pub async fn strategy_update_from_draft(
    input: StrategyUpdateFromDraftInput,
) -> Result<StrategyResult, String> {
    let existing = db_get_strategy(&input.id)
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "Strategy not found".to_string())?;
    let mut draft: StrategyDraft = input.draft.into();
    draft.id = Some(input.id.clone());
    let (strategy, simulation) =
        build_active_strategy(input.id.clone(), draft, Some(&existing), input.status)?;
    upsert_strategy(&strategy).map_err(|err| err.to_string())?;
    audit::record("strategy_updated_from_draft", "strategy", Some(&strategy.id), &simulation);
    Ok(StrategyResult { strategy })
}

#[tauri::command]
pub async fn strategy_get(input: StrategyGetInput) -> Result<StrategyDetailResult, String> {
    let strategy = db_get_strategy(&input.id)
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "Strategy not found".to_string())?;
    let draft = serde_json::from_str::<StrategyDraft>(&strategy.draft_graph_json).ok();
    let plan = serde_json::from_str::<Option<CompiledStrategyPlan>>(&strategy.compiled_plan_json)
        .ok()
        .flatten()
        .or_else(|| serde_json::from_str::<CompiledStrategyPlan>(&strategy.compiled_plan_json).ok());
    Ok(StrategyDetailResult { strategy, draft, plan })
}

#[tauri::command]
pub async fn strategy_get_execution_history(
    input: GetStrategyExecutionsInput,
) -> Result<Vec<StrategyExecutionRecord>, String> {
    local_db::get_strategy_executions(input.strategy_id.as_deref(), input.limit.unwrap_or(100))
        .map_err(|err| err.to_string())
}
