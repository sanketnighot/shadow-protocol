//! Agent chat commands — backend-owned tool loop.

use serde::{Deserialize, Serialize};

use crate::services::agent_chat::{self, ChatAgentResponse};

#[tauri::command]
pub async fn chat_agent(input: agent_chat::ChatAgentInput) -> Result<ChatAgentResponse, String> {
    let model = input.model.trim();
    if model.is_empty() {
        return Err("Model is required".to_string());
    }

    agent_chat::run_agent(input).await
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
    if tool_name != "execute_token_swap" {
        return Ok(ApproveAgentActionResult {
            success: false,
            message: format!("Unknown or unsupported tool: {tool_name}"),
            tx_hash: None,
        });
    }

    // Phase 1: Swap execution not yet connected to a DEX/router.
    // Approval flow is validated; execution is Phase 2.
    let _ = input.payload;
    Ok(ApproveAgentActionResult {
        success: false,
        message: "Swap execution is not yet implemented. Use Portfolio to transfer or swap manually."
            .to_string(),
        tx_hash: None,
    })
}
