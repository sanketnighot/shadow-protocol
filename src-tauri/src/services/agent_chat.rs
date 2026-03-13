//! Agent chat orchestration: Ollama + tool loop.

use reqwest::Client;
use serde::{Deserialize, Serialize};

use super::ollama_client;
use super::tool_router::{self, ToolResult};

const MAX_TOOL_ROUNDS: u32 = 5;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatAgentInput {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    /// Single address for swap execution; all addresses for portfolio tools
    pub wallet_address: Option<String>,
    pub wallet_addresses: Option<Vec<String>>,
    pub num_ctx: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ChatAgentResponse {
    AssistantMessage {
        content: String,
        blocks: Vec<ResponseBlock>,
    },
    ApprovalRequired {
        tool_name: String,
        payload: serde_json::Value,
        message: String,
    },
    #[allow(dead_code)]
    Error { message: String },
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ResponseBlock {
    Text { content: String },
    ToolResult {
        tool_name: String,
        content: String,
    },
}

fn build_approval_message(tool_name: &str, payload: &serde_json::Value) -> String {
    match tool_name {
        "execute_token_swap" => {
            let from = payload.get("fromToken").and_then(|v| v.as_str()).unwrap_or("?");
            let to = payload.get("toToken").and_then(|v| v.as_str()).unwrap_or("?");
            let amount = payload.get("amount").and_then(|v| v.as_str()).unwrap_or("?");
            let chain = payload.get("chain").and_then(|v| v.as_str()).unwrap_or("?");
            let est = payload.get("estimatedOutput").and_then(|v| v.as_str()).unwrap_or("~");
            format!(
                "I'd like to swap {amount} {from} → {to} on {chain}. Estimated output: {est} {to}. Please review the details and confirm below."
            )
        }
        _ => format!("I need your approval to run **{tool_name}**. Please review and confirm."),
    }
}

pub async fn run_agent(input: ChatAgentInput) -> Result<ChatAgentResponse, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let wallet = input.wallet_address.as_deref();
    let wallet_addresses: Vec<String> = input
        .wallet_addresses
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| {
            input
                .wallet_address
                .as_ref()
                .map(|a| vec![a.clone()])
                .unwrap_or_default()
        });
    let tools_prompt = tool_router::tools_system_prompt();

    let messages: Vec<(String, String)> = input
        .messages
        .iter()
        .map(|m| {
            let role = if m.role == "assistant" { "assistant" } else { "user" };
            (role.to_string(), m.content.clone())
        })
        .collect();

    let mut built: Vec<(String, String)> = vec![("system".into(), tools_prompt)];
    for (role, content) in &messages {
        if role != "system" {
            built.push((role.clone(), content.clone()));
        }
    }

    let mut round = 0u32;
    let mut blocks = Vec::new();

    loop {
        if round >= MAX_TOOL_ROUNDS {
            break Ok(ChatAgentResponse::AssistantMessage {
                content: "I've reached the limit of data lookups. Please try a simpler question.".to_string(),
                blocks,
            });
        }

        let response = ollama_client::chat(
            &client,
            &input.model,
            &built,
            input.num_ctx,
        )
        .await
        .map_err(|e| e.to_string())?;

        let result = tool_router::route_and_execute(&response, wallet, &wallet_addresses).await?;

        match result {
            ToolResult::AssistantMessage { content } => {
                if content.trim().is_empty() {
                    break Ok(ChatAgentResponse::AssistantMessage {
                        content: "Done.".to_string(),
                        blocks,
                    });
                }
                blocks.push(ResponseBlock::Text {
                    content: content.clone(),
                });
                break Ok(ChatAgentResponse::AssistantMessage {
                    content,
                    blocks,
                });
            }
            ToolResult::ToolOutput { tool_name, content } => {
                blocks.push(ResponseBlock::ToolResult {
                    tool_name: tool_name.clone(),
                    content: content.clone(),
                });
                built.push(("assistant".into(), response));
                built.push((
                    "user".into(),
                    format!("Tool result for {}:\n{}", tool_name, content),
                ));
                round += 1;
            }
            ToolResult::ApprovalRequired { tool_name, payload } => {
                let message = build_approval_message(&tool_name, &payload);
                break Ok(ChatAgentResponse::ApprovalRequired {
                    tool_name,
                    payload,
                    message,
                });
            }
            ToolResult::Error { message } => {
                break Ok(ChatAgentResponse::AssistantMessage {
                    content: format!("I couldn't complete that: {message}"),
                    blocks,
                });
            }
        }
    }
}
