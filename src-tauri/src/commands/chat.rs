//! Agent chat commands — backend-owned tool loop.

use serde::{Deserialize, Serialize};

use crate::services::agent_chat::{self, ChatAgentResponse};

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
    
    if tool_name == "execute_token_swap" {
        // Phase 1: Swap execution not yet connected to a DEX/router.
        // Approval flow is validated; execution is Phase 2.
        let _ = input.payload;
        return Ok(ApproveAgentActionResult {
            success: false,
            message: "Swap execution is not yet implemented. Use Portfolio to transfer or swap manually."
                .to_string(),
            tx_hash: None,
        });
    }

    if tool_name == "create_automation_strategy" {
        let payload = input.payload;
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
            next_run_at: None,
        };

        crate::services::local_db::upsert_strategy(&strategy).map_err(|e| e.to_string())?;

        return Ok(ApproveAgentActionResult {
            success: true,
            message: format!("Strategy '{}' has been created and is now active.", strategy.name),
            tx_hash: None,
        });
    }

    Ok(ApproveAgentActionResult {
        success: false,
        message: format!("Unknown or unsupported tool: {tool_name}"),
        tx_hash: None,
    })
}
