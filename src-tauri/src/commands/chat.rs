//! Agent chat commands — backend-owned tool loop.

use serde::{Deserialize, Serialize};

use crate::services::agent_chat::{self, ChatAgentResponse};
use crate::services::apps::{backup_payload_from_scope, filecoin, flow};
use crate::services::apps::state as apps_state;
use crate::services::audit;
use crate::services::local_db::{
    self, ActiveStrategy, ApprovalRecord, CommandLogEntry, ToolExecutionRecord,
    get_command_log as db_get_command_log, get_strategies as db_get_strategies,
    insert_command_log, upsert_strategy,
};
use crate::services::strategy_legacy::infer_strategy_fields_for_legacy;

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
    let id = uuid::Uuid::new_v4().to_string();
    let name = input.name.trim().to_string();
    let summary = input.summary.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    if name.is_empty() {
        return Err("Strategy name is required".to_string());
    }
    let mut strategy = infer_strategy_fields_for_legacy(
        &id,
        &name,
        summary,
        &input.mode.unwrap_or_else(|| "approval_required".to_string()),
        &input.trigger.to_string(),
        &input.action.to_string(),
        &input.guardrails.to_string(),
        &input.approval_policy.unwrap_or_else(|| serde_json::json!({"mode": "always_require"})).to_string(),
        &input.execution_policy.unwrap_or_else(|| serde_json::json!({"enabled": false, "fallbackToApproval": true, "killSwitch": false})).to_string(),
    );
    strategy.status = "active".to_string();
    strategy.next_run_at = Some(now_secs());
    upsert_strategy(&strategy).map_err(|e| e.to_string())?;
    audit::record("strategy_created", "strategy", Some(&strategy.id), &strategy);
    Ok(StrategyResult { strategy })
}

#[tauri::command]
pub async fn update_strategy(input: UpdateStrategyInput) -> Result<StrategyResult, String> {
    let existing = db_get_strategies()
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|s| s.id == input.id)
        .ok_or_else(|| "Strategy not found".to_string())?;

    let next_name = if let Some(name) = input.name {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err("Strategy name cannot be empty".to_string());
        }
        trimmed.to_string()
    } else {
        existing.name.clone()
    };
    let next_summary = input
        .summary
        .map(|summary| summary.trim().to_string())
        .filter(|item| !item.is_empty())
        .or(existing.summary.clone());
    let next_mode = input.mode.unwrap_or_else(|| existing.mode.clone());
    let next_trigger_json = input
        .trigger
        .unwrap_or_else(|| serde_json::from_str(&existing.trigger_json).unwrap_or_else(|_| serde_json::json!({})))
        .to_string();
    let next_action_json = input
        .action
        .unwrap_or_else(|| serde_json::from_str(&existing.action_json).unwrap_or_else(|_| serde_json::json!({})))
        .to_string();
    let next_guardrails_json = input
        .guardrails
        .unwrap_or_else(|| serde_json::from_str(&existing.guardrails_json).unwrap_or_else(|_| serde_json::json!({})))
        .to_string();
    let next_approval_policy_json = input
        .approval_policy
        .unwrap_or_else(|| serde_json::from_str(&existing.approval_policy_json).unwrap_or_else(|_| serde_json::json!({})))
        .to_string();
    let next_execution_policy_json = input
        .execution_policy
        .unwrap_or_else(|| serde_json::from_str(&existing.execution_policy_json).unwrap_or_else(|_| serde_json::json!({})))
        .to_string();

    let mut strategy = infer_strategy_fields_for_legacy(
        &existing.id,
        &next_name,
        next_summary,
        &next_mode,
        &next_trigger_json,
        &next_action_json,
        &next_guardrails_json,
        &next_approval_policy_json,
        &next_execution_policy_json,
    );
    strategy.status = input.status.unwrap_or_else(|| existing.status.clone());
    strategy.failure_count = existing.failure_count;
    strategy.last_evaluation_at = existing.last_evaluation_at;
    strategy.disabled_reason = existing.disabled_reason.clone();
    strategy.last_run_at = existing.last_run_at;
    strategy.next_run_at = existing.next_run_at;
    strategy.last_execution_status = existing.last_execution_status.clone();
    strategy.last_execution_reason = existing.last_execution_reason.clone();

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
    let runnable = strategy.status != "paused";
    let compiled_ok = strategy.validation_state == "valid";
    Ok(StrategySimulationResult {
        strategy_id: strategy.id,
        valid: runnable && compiled_ok,
        message: if !runnable {
            "Strategy is paused and will not execute.".to_string()
        } else if !compiled_ok {
            "Strategy plan is invalid; open the builder to repair.".to_string()
        } else {
            "Strategy is eligible for the automation engine.".to_string()
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
pub async fn approve_agent_action(
    app: tauri::AppHandle,
    input: ApproveAgentActionInput,
) -> Result<ApproveAgentActionResult, String> {
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
        let mut strategy = infer_strategy_fields_for_legacy(
            &uuid::Uuid::new_v4().to_string(),
            payload.get("name").and_then(|v| v.as_str()).unwrap_or("New Strategy").trim(),
            payload.get("summary").and_then(|v| v.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
            "approval_required",
            &payload.get("trigger").cloned().unwrap_or_else(|| serde_json::json!({})).to_string(),
            &payload.get("action").cloned().unwrap_or_else(|| serde_json::json!({})).to_string(),
            &payload.get("guardrails").cloned().unwrap_or_else(|| serde_json::json!({})).to_string(),
            &serde_json::json!({"mode": "always_require"}).to_string(),
            &serde_json::json!({"enabled": false, "fallbackToApproval": true, "killSwitch": false}).to_string(),
        );
        strategy.status = "active".to_string();
        strategy.next_run_at = Some(now);

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
    } else if tool_name == "flow_protocol_prepare_sponsored_transaction" {
        let proposal = input
            .payload
            .get("original")
            .cloned()
            .unwrap_or_else(|| input.payload.clone());
        match flow::prepare_sponsored_transaction(&app, proposal).await {
            Ok(data) => {
                execution.status = "succeeded".to_string();
                execution.result_json =
                    Some(serde_json::to_string(&data).unwrap_or_else(|_| "{}".to_string()));
                execution.completed_at = Some(now_secs());
                local_db::update_tool_execution(&execution).map_err(|e| e.to_string())?;
                ApproveAgentActionResult {
                    success: true,
                    execution_id: Some(execution_id),
                    message: "Flow transaction prepared (review prepared payload in execution log)."
                        .to_string(),
                    tx_hash: None,
                }
            }
            Err(e) => {
                execution.status = "failed".to_string();
                execution.error_code = Some("flow_prepare_failed".to_string());
                execution.error_message = Some(e.clone());
                execution.completed_at = Some(now_secs());
                local_db::update_tool_execution(&execution).map_err(|e| e.to_string())?;
                ApproveAgentActionResult {
                    success: false,
                    execution_id: Some(execution_id),
                    message: e,
                    tx_hash: None,
                }
            }
        }
    } else if tool_name == "filecoin_protocol_request_backup" {
        let scope = input
            .payload
            .get("scope")
            .cloned()
            .unwrap_or_else(|| serde_json::json!({}));
        let bytes = backup_payload_from_scope(&app, &scope).map_err(|e| e.to_string())?;
        let ciphertext_hex = hex::encode(&bytes);
        match filecoin::prepare_encrypted_backup(&app, scope.clone(), ciphertext_hex).await {
            Ok(data) => {
                let cid = data
                    .get("cid")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();
                let row = apps_state::AppBackupRow {
                    id: uuid::Uuid::new_v4().to_string(),
                    app_id: "filecoin-storage".to_string(),
                    cid: cid.clone(),
                    encryption_version: 1,
                    created_at: now_secs(),
                    scope_json: scope.to_string(),
                    status: "complete".to_string(),
                    size_bytes: Some(bytes.len() as i64),
                    notes: Some("manual_backup".to_string()),
                };
                let _ = apps_state::insert_app_backup(&row);
                execution.status = "succeeded".to_string();
                execution.result_json =
                    Some(serde_json::to_string(&data).unwrap_or_else(|_| "{}".to_string()));
                execution.completed_at = Some(now_secs());
                local_db::update_tool_execution(&execution).map_err(|e| e.to_string())?;
                ApproveAgentActionResult {
                    success: true,
                    execution_id: Some(execution_id),
                    message: format!("Backup completed. CID recorded: {cid}"),
                    tx_hash: None,
                }
            }
            Err(e) => {
                execution.status = "failed".to_string();
                execution.error_code = Some("filecoin_backup_failed".to_string());
                execution.error_message = Some(e.clone());
                execution.completed_at = Some(now_secs());
                local_db::update_tool_execution(&execution).map_err(|e| e.to_string())?;
                ApproveAgentActionResult {
                    success: false,
                    execution_id: Some(execution_id),
                    message: e,
                    tx_hash: None,
                }
            }
        }
    } else if tool_name == "filecoin_protocol_request_restore" {
        let cid = input
            .payload
            .get("cid")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Missing cid".to_string())?;
        match filecoin::prepare_restore(&app, cid).await {
            Ok(data) => {
                execution.status = "succeeded".to_string();
                execution.result_json =
                    Some(serde_json::to_string(&data).unwrap_or_else(|_| "{}".to_string()));
                execution.completed_at = Some(now_secs());
                local_db::update_tool_execution(&execution).map_err(|e| e.to_string())?;
                ApproveAgentActionResult {
                    success: true,
                    execution_id: Some(execution_id),
                    message: "Restore payload fetched (stub transport — verify before mainnet)."
                        .to_string(),
                    tx_hash: None,
                }
            }
            Err(e) => {
                execution.status = "failed".to_string();
                execution.error_code = Some("filecoin_restore_failed".to_string());
                execution.error_message = Some(e.clone());
                execution.completed_at = Some(now_secs());
                local_db::update_tool_execution(&execution).map_err(|e| e.to_string())?;
                ApproveAgentActionResult {
                    success: false,
                    execution_id: Some(execution_id),
                    message: e,
                    tx_hash: None,
                }
            }
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
