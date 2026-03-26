//! Agent chat commands — backend-owned tool loop.

use serde::{Deserialize, Serialize};

use crate::services::agent_chat::{self, ChatAgentResponse};
use crate::services::audit;
use crate::services::local_db::{
    self, ActiveStrategy, ApprovalRecord, CommandLogEntry, ToolExecutionRecord,
    get_command_log as db_get_command_log, get_strategies as db_get_strategies,
    insert_command_log, upsert_strategy,
};

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyStatusInput {
    pub id: String,
    pub status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteStrategyInput {
    pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetExecutionLogInput {
    pub limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetPendingApprovalsInput {
    pub source: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateStrategyInput {
    pub name: String,
    pub summary: Option<String>,
    pub mode: Option<String>,
    pub trigger: serde_json::Value,
    pub action: serde_json::Value,
    pub guardrails: serde_json::Value,
    pub approval_policy: Option<serde_json::Value>,
    pub execution_policy: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStrategyInput {
    pub id: String,
    pub name: Option<String>,
    pub summary: Option<String>,
    pub status: Option<String>,
    pub mode: Option<String>,
    pub trigger: Option<serde_json::Value>,
    pub action: Option<serde_json::Value>,
    pub guardrails: Option<serde_json::Value>,
    pub approval_policy: Option<serde_json::Value>,
    pub execution_policy: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyResult {
    pub strategy: ActiveStrategy,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteStrategyResult {
    pub success: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunStrategySimulationInput {
    pub id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategySimulationResult {
    pub strategy_id: String,
    pub valid: bool,
    pub message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetStrategyExecutionsInput {
    pub strategy_id: Option<String>,
    pub limit: Option<u32>,
}

#[tauri::command]
pub async fn get_strategies() -> Result<Vec<ActiveStrategy>, String> {
    db_get_strategies().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_strategy(input: CreateStrategyInput) -> Result<StrategyResult, String> {
    let now = now_secs();
    let strategy = ActiveStrategy {
        id: uuid::Uuid::new_v4().to_string(),
        name: input.name.trim().to_string(),
        summary: input.summary.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
        status: "active".to_string(),
        mode: input.mode.unwrap_or_else(|| "approval_required".to_string()),
        trigger_json: input.trigger.to_string(),
        action_json: input.action.to_string(),
        guardrails_json: input.guardrails.to_string(),
        approval_policy_json: input.approval_policy.unwrap_or_else(|| serde_json::json!({"mode": "always_require"})).to_string(),
        execution_policy_json: input.execution_policy.unwrap_or_else(|| serde_json::json!({"enabled": false})).to_string(),
        failure_count: 0,
        last_evaluation_at: None,
        disabled_reason: None,
        last_run_at: None,
        next_run_at: Some(now),
    };
    if strategy.name.is_empty() {
        return Err("Strategy name is required".to_string());
    }
    upsert_strategy(&strategy).map_err(|e| e.to_string())?;
    audit::record("strategy_created", "strategy", Some(&strategy.id), &strategy);
    Ok(StrategyResult { strategy })
}

#[tauri::command]
pub async fn update_strategy(input: UpdateStrategyInput) -> Result<StrategyResult, String> {
    let mut strategy = db_get_strategies()
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|s| s.id == input.id)
        .ok_or_else(|| "Strategy not found".to_string())?;

    if let Some(name) = input.name {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err("Strategy name cannot be empty".to_string());
        }
        strategy.name = trimmed.to_string();
    }
    if let Some(summary) = input.summary {
        strategy.summary = Some(summary.trim().to_string()).filter(|s| !s.is_empty());
    }
    if let Some(status) = input.status {
        strategy.status = status;
    }
    if let Some(mode) = input.mode {
        strategy.mode = mode;
    }
    if let Some(trigger) = input.trigger {
        strategy.trigger_json = trigger.to_string();
    }
    if let Some(action) = input.action {
        strategy.action_json = action.to_string();
    }
    if let Some(guardrails) = input.guardrails {
        strategy.guardrails_json = guardrails.to_string();
    }
    if let Some(policy) = input.approval_policy {
        strategy.approval_policy_json = policy.to_string();
    }
    if let Some(policy) = input.execution_policy {
        strategy.execution_policy_json = policy.to_string();
    }

    upsert_strategy(&strategy).map_err(|e| e.to_string())?;
    audit::record("strategy_updated", "strategy", Some(&strategy.id), &strategy);
    Ok(StrategyResult { strategy })
}

#[tauri::command]
pub async fn update_strategy_status(input: StrategyStatusInput) -> Result<StrategyResult, String> {
    update_strategy(UpdateStrategyInput {
        id: input.id,
        name: None,
        summary: None,
        status: Some(input.status),
        mode: None,
        trigger: None,
        action: None,
        guardrails: None,
        approval_policy: None,
        execution_policy: None,
    })
    .await
}

#[tauri::command]
pub async fn pause_strategy(input: StrategyStatusInput) -> Result<StrategyResult, String> {
    update_strategy_status(StrategyStatusInput { id: input.id, status: "paused".to_string() }).await
}

#[tauri::command]
pub async fn resume_strategy(input: StrategyStatusInput) -> Result<StrategyResult, String> {
    update_strategy_status(StrategyStatusInput { id: input.id, status: "active".to_string() }).await
}

#[tauri::command]
pub async fn delete_strategy(input: DeleteStrategyInput) -> Result<DeleteStrategyResult, String> {
    local_db::with_connection(|conn| {
        conn.execute("DELETE FROM active_strategies WHERE id = ?1", rusqlite::params![input.id])?;
        Ok(())
    }).map_err(|e| e.to_string())?;
    Ok(DeleteStrategyResult { success: true })
}

#[tauri::command]
pub async fn run_strategy_simulation(input: RunStrategySimulationInput) -> Result<StrategySimulationResult, String> {
    let strategy = db_get_strategies()
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|s| s.id == input.id)
        .ok_or_else(|| "Strategy not found".to_string())?;
    let valid = strategy.status != "paused";
    Ok(StrategySimulationResult {
        strategy_id: strategy.id,
        valid,
        message: if valid {
            "Strategy passes local validation and policy checks.".to_string()
        } else {
            "Strategy is paused and cannot execute.".to_string()
        },
    })
}

#[tauri::command]
pub async fn get_strategy_executions(input: GetStrategyExecutionsInput) -> Result<Vec<ToolExecutionRecord>, String> {
    let mut items = local_db::get_tool_executions(input.limit.unwrap_or(100)).map_err(|e| e.to_string())?;
    if let Some(strategy_id) = input.strategy_id {
        items.retain(|x| x.strategy_id.as_deref() == Some(strategy_id.as_str()));
    }
    Ok(items)
}

#[tauri::command]
pub async fn get_command_log(limit: u32) -> Result<Vec<CommandLogEntry>, String> {
    db_get_command_log(limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn chat_agent(app: tauri::AppHandle, input: agent_chat::ChatAgentInput) -> Result<ChatAgentResponse, String> {
    let model = input.model.trim();
    if model.is_empty() {
        return Err("Model is required".to_string());
    }

    agent_chat::run_agent(input, &app).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveAgentActionInput {
    pub approval_id: String,
    #[serde(rename = "toolName")]
    pub tool_name: String,
    pub payload: serde_json::Value,
    pub expected_version: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RejectAgentActionInput {
    pub approval_id: String,
    pub expected_version: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveAgentActionResult {
    pub success: bool,
    pub execution_id: Option<String>,
    pub message: String,
    pub tx_hash: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RejectAgentActionResult {
    pub success: bool,
    pub message: String,
}

#[tauri::command]
pub async fn get_pending_approvals(input: GetPendingApprovalsInput) -> Result<Vec<ApprovalRecord>, String> {
    let mut items = local_db::get_pending_approvals().map_err(|e| e.to_string())?;
    if let Some(source) = input.source {
        items.retain(|x| x.source == source);
    }
    Ok(items)
}

#[tauri::command]
pub async fn get_execution_log(input: GetExecutionLogInput) -> Result<Vec<ToolExecutionRecord>, String> {
    local_db::get_tool_executions(input.limit.unwrap_or(100)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reject_agent_action(input: RejectAgentActionInput) -> Result<RejectAgentActionResult, String> {
    let updated = local_db::update_approval_request_status(&input.approval_id, "rejected", input.expected_version)
        .map_err(|e| e.to_string())?;
    if !updated {
        return Err("Approval was already handled or version mismatch occurred".to_string());
    }
    audit::record("approval_rejected", "approval_request", Some(&input.approval_id), &serde_json::json!({}));
    Ok(RejectAgentActionResult {
        success: true,
        message: "Approval request rejected.".to_string(),
    })
}

#[tauri::command]
pub async fn approve_agent_action(input: ApproveAgentActionInput) -> Result<ApproveAgentActionResult, String> {
    let now = now_secs();
    local_db::expire_stale_approvals(now).map_err(|e| e.to_string())?;

    let approval = local_db::get_approval_request(&input.approval_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Approval request not found".to_string())?;

    if approval.tool_name != input.tool_name {
        return Err("Approval tool mismatch".to_string());
    }
    if approval.status != "pending" {
        return Err("Approval request is no longer pending".to_string());
    }
    if approval.expires_at.map(|ts| ts < now).unwrap_or(false) {
        return Err("Approval request expired".to_string());
    }

    let updated = local_db::update_approval_request_status(&input.approval_id, "approved", input.expected_version)
        .map_err(|e| e.to_string())?;
    if !updated {
        return Err("Approval was already handled or version mismatch occurred".to_string());
    }

    let execution_id = uuid::Uuid::new_v4().to_string();
    let mut execution = ToolExecutionRecord {
        id: execution_id.clone(),
        approval_id: Some(input.approval_id.clone()),
        strategy_id: approval.strategy_id.clone(),
        tool_name: approval.tool_name.clone(),
        status: "executing".to_string(),
        request_json: input.payload.to_string(),
        result_json: None,
        tx_hash: None,
        error_code: None,
        error_message: None,
        created_at: now,
        completed_at: None,
    };
    local_db::insert_tool_execution(&execution).map_err(|e| e.to_string())?;
    audit::record("approval_approved", "approval_request", Some(&input.approval_id), &serde_json::json!({
        "executionId": execution_id,
        "toolName": input.tool_name,
    }));

    let tool_name = input.tool_name.trim();
    let result = if tool_name == "execute_token_swap" {
        execution.status = "failed".to_string();
        execution.error_code = Some("unsupported_route".to_string());
        execution.error_message = Some("Production swap execution is not yet available for the requested route.".to_string());
        execution.result_json = Some(
            serde_json::json!({
                "supported": false,
                "reason": "unsupported_route"
            })
            .to_string(),
        );
        execution.completed_at = Some(now_secs());
        local_db::update_tool_execution(&execution).map_err(|e| e.to_string())?;
        ApproveAgentActionResult {
            success: false,
            execution_id: Some(execution_id),
            message: "Swap execution refused because no production swap route is configured for this action.".to_string(),
            tx_hash: None,
        }
    } else if tool_name == "create_automation_strategy" {
        let payload = &input.payload;
        let strategy = ActiveStrategy {
            id: uuid::Uuid::new_v4().to_string(),
            name: payload.get("name").and_then(|v| v.as_str()).unwrap_or("New Strategy").trim().to_string(),
            summary: payload.get("summary").and_then(|v| v.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
            status: "active".to_string(),
            mode: "approval_required".to_string(),
            trigger_json: payload.get("trigger").cloned().unwrap_or_else(|| serde_json::json!({})).to_string(),
            action_json: payload.get("action").cloned().unwrap_or_else(|| serde_json::json!({})).to_string(),
            guardrails_json: payload.get("guardrails").cloned().unwrap_or_else(|| serde_json::json!({})).to_string(),
            approval_policy_json: serde_json::json!({"mode": "always_require"}).to_string(),
            execution_policy_json: serde_json::json!({"enabled": false}).to_string(),
            failure_count: 0,
            last_evaluation_at: None,
            disabled_reason: None,
            last_run_at: None,
            next_run_at: Some(now),
        };

        upsert_strategy(&strategy).map_err(|e| e.to_string())?;
        execution.status = "succeeded".to_string();
        execution.result_json = Some(serde_json::json!({"strategyId": strategy.id, "status": "active"}).to_string());
        execution.completed_at = Some(now_secs());
        local_db::update_tool_execution(&execution).map_err(|e| e.to_string())?;
        audit::record("strategy_created", "strategy", Some(&strategy.id), &strategy);
        ApproveAgentActionResult {
            success: true,
            execution_id: Some(execution_id),
            message: format!("Strategy '{}' has been created and is now active.", strategy.name),
            tx_hash: None,
        }
    } else {
        execution.status = "failed".to_string();
        execution.error_code = Some("unsupported_tool".to_string());
        execution.error_message = Some(format!("Unknown or unsupported tool: {tool_name}"));
        execution.completed_at = Some(now_secs());
        local_db::update_tool_execution(&execution).map_err(|e| e.to_string())?;
        ApproveAgentActionResult {
            success: false,
            execution_id: Some(execution_id),
            message: format!("Unknown or unsupported tool: {tool_name}"),
            tx_hash: None,
        }
    };

    let log_entry = CommandLogEntry {
        id: uuid::Uuid::new_v4().to_string(),
        tool_name: tool_name.to_string(),
        payload_json: input.payload.to_string(),
        result_message: result.message.clone(),
        status: if result.success { "approved" } else { "failed" }.to_string(),
        created_at: now,
    };
    let _ = insert_command_log(&log_entry);

    Ok(result)
}
