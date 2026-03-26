//! Agent chat commands — backend-owned tool loop.

use serde::{Deserialize, Serialize};

use crate::services::agent_chat::{self, ChatAgentResponse};
use crate::services::local_db::{ActiveStrategy, CommandLogEntry, insert_command_log, get_command_log as db_get_command_log, get_strategies as db_get_strategies, upsert_strategy};

#[tauri::command]
pub async fn get_strategies() -> Result<Vec<ActiveStrategy>, String> {
    db_get_strategies().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_strategy_status(id: String, status: String) -> Result<(), String> {
    let strategies = db_get_strategies().map_err(|e| e.to_string())?;
    if let Some(mut strategy) = strategies.into_iter().find(|s| s.id == id) {
        strategy.status = status;
        upsert_strategy(&strategy).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Strategy not found".to_string())
    }
}

#[tauri::command]
pub async fn delete_strategy(id: String) -> Result<(), String> {
    crate::services::local_db::with_connection(|conn| {
        conn.execute("DELETE FROM active_strategies WHERE id = ?1", rusqlite::params![id])?;
        Ok(())
    }).map_err(|e| e.to_string())
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
    #[serde(rename = "toolName")]
    pub tool_name: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveAgentActionResult {
    pub success: bool,
    pub message: String,
    pub tx_hash: Option<String>,
}

#[tauri::command]
pub async fn approve_agent_action(input: ApproveAgentActionInput) -> Result<ApproveAgentActionResult, String> {
    let tool_name = input.tool_name.trim();
    let log_id = uuid::Uuid::new_v4().to_string();
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64;
    
    let result = if tool_name == "execute_token_swap" {
        // Phase 1: Swap execution not yet connected to a DEX/router.
        // Approval flow is validated; execution is Phase 2.
        ApproveAgentActionResult {
            success: false,
            message: "Swap execution is not yet implemented. Use Portfolio to transfer or swap manually."
                .to_string(),
            tx_hash: None,
        }
    } else if tool_name == "create_automation_strategy" {
        let payload = &input.payload;
        let id = uuid::Uuid::new_v4().to_string();
        let name = payload.get("name").and_then(|v| v.as_str()).unwrap_or("New Strategy").to_string();
        let summary = payload.get("summary").and_then(|v| v.as_str()).map(|s| s.to_string());
        
        let trigger_json = payload.get("trigger").map(|v| v.to_string()).unwrap_or_else(|| "{}".to_string());
        let action_json = payload.get("action").map(|v| v.to_string()).unwrap_or_else(|| "{}".to_string());
        let guardrails_json = payload.get("guardrails").map(|v| v.to_string()).unwrap_or_else(|| "{}".to_string());

        let strategy = crate::services::local_db::ActiveStrategy {
            id: id.clone(),
            name,
            summary,
            status: "active".to_string(),
            trigger_json,
            action_json,
            guardrails_json,
            last_run_at: None,
            next_run_at: Some(now), // Run immediately on next heartbeat
        };

        match crate::services::local_db::upsert_strategy(&strategy) {
            Ok(_) => ApproveAgentActionResult {
                success: true,
                message: format!("Strategy '{}' has been created and is now active.", strategy.name),
                tx_hash: None,
            },
            Err(e) => ApproveAgentActionResult {
                success: false,
                message: format!("Failed to save strategy: {}", e),
                tx_hash: None,
            }
        }
    } else {
        ApproveAgentActionResult {
            success: false,
            message: format!("Unknown or unsupported tool: {tool_name}"),
            tx_hash: None,
        }
    };

    // Log the command result
    let log_entry = CommandLogEntry {
        id: log_id,
        tool_name: tool_name.to_string(),
        payload_json: input.payload.to_string(),
        result_message: result.message.clone(),
        status: if result.success { "approved" } else { "failed" }.to_string(),
        created_at: now,
    };
    let _ = insert_command_log(&log_entry);

    Ok(result)
}
