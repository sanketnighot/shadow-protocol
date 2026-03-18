//! Agent chat orchestration: deterministic advice pipeline + tool loop.

use reqwest::Client;
use serde::{Deserialize, Serialize};

use super::ollama_client;
use super::tool_router::{self, AgentContext, ToolResult};

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
    /// Recent structured facts from tool outputs for follow-up context.
    pub structured_facts: Option<String>,
    /// When true, advice pipeline simulates; no swap execution.
    #[serde(default)]
    pub demo_mode: bool,
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

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ResponseBlock {
    Text { content: String },
    ToolResult {
        tool_name: String,
        content: String,
    },
}

fn format_tool_result(tool_name: &str, content: &str) -> String {
    let parsed: serde_json::Value = match serde_json::from_str(content) {
        Ok(v) => v,
        Err(_) => return format!("Data received. See details below."),
    };

    match tool_name {
        "get_total_portfolio_value" => {
            let total = parsed
                .get("totalUsd")
                .and_then(|v| v.as_str())
                .unwrap_or("$0.00");
            let wallet_count = parsed
                .get("walletCount")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let breakdown = parsed
                .get("breakdown")
                .and_then(|b| b.as_array())
                .map(|a| a.as_slice())
                .unwrap_or(&[]);
            let mut lines = Vec::new();
            lines.push(format!(
                "Your portfolio totals **{}** across {} wallet(s).",
                total,
                wallet_count
            ));
            if breakdown.is_empty() {
                lines.push("No token holdings found.".to_string());
            } else {
                lines.push("Breakdown:".to_string());
                for item in breakdown {
                    let token = item.get("token").and_then(|v| v.as_str()).unwrap_or("?");
                    let amount = item.get("amount").and_then(|v| v.as_str()).unwrap_or("0");
                    let value = item.get("value").and_then(|v| v.as_str()).unwrap_or("$0.00");
                    let chains = item.get("chains").and_then(|v| v.as_str());
                    let chain_str = chains
                        .filter(|s| !s.is_empty())
                        .map(|s| format!(" ({})", s))
                        .unwrap_or_default();
                    lines.push(format!("• {}: {} ({}){}", token, amount, value, chain_str));
                }
            }
            lines.join("\n")
        }
        "get_wallet_balances" => {
            let items = parsed.as_array().map(|a| a.as_slice()).unwrap_or(&[]);
            if items.is_empty() {
                return "No balances found.".to_string();
            }
            let mut lines = vec!["Balances by chain and token:".to_string()];
            for item in items {
                let chain = item.get("chain").and_then(|v| v.as_str()).unwrap_or("?");
                let token = item.get("token").and_then(|v| v.as_str()).unwrap_or("?");
                let amount = item.get("amount").and_then(|v| v.as_str()).unwrap_or("0");
                let value = item.get("valueUsd").and_then(|v| v.as_str()).unwrap_or("$0.00");
                lines.push(format!("• {} on {}: {} ({})", token, chain, amount, value));
            }
            lines.join("\n")
        }
        "get_token_price" => {
            let price = parsed
                .get("priceUsd")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            format!("Current price: **${:.4}**", price)
        }
        "web_research" => {
            // Sonar output is usually markdown already
            parsed.as_str().unwrap_or("Research complete.").to_string()
        }
        "analyze_portfolio_history" => {
            let items = parsed.as_array().map(|a| a.as_slice()).unwrap_or(&[]);
            if items.is_empty() {
                return "No historical snapshots found yet.".to_string();
            }
            let mut lines = vec!["Historical Portfolio Snapshots:".to_string()];
            for item in items {
                let ts = item.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0);
                let val = item.get("totalUsd").and_then(|v| v.as_str()).unwrap_or("$0.00");
                let date = chrono::DateTime::from_timestamp(ts, 0)
                    .map(|d| d.format("%Y-%m-%d %H:%M").to_string())
                    .unwrap_or_else(|| "unknown".into());
                lines.push(format!("• {}: **{}**", date, val));
            }
            lines.join("\n")
        }
        _ => "Data received. See details below.".to_string(),
    }
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

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let agent_ctx = AgentContext {
        wallet_count: wallet_addresses.len() as u32,
        active_address: input.wallet_address.clone(),
        all_addresses: wallet_addresses.clone(),
    };

    let tools_prompt = tool_router::tools_system_prompt(&agent_ctx);
    let mut built_messages: Vec<(String, String)> = vec![("system".into(), tools_prompt)];
    
    // Add existing conversation history
    for m in &input.messages {
        let role = if m.role == "assistant" { "assistant" } else { "user" };
        built_messages.push((role.to_string(), m.content.clone()));
    }

    let mut blocks = Vec::new();
    let mut current_round = 0;

    loop {
        if current_round >= MAX_TOOL_ROUNDS {
            return Ok(ChatAgentResponse::AssistantMessage {
                content: "I've reached my reasoning limit for this request. Please try a more specific question.".to_string(),
                blocks,
            });
        }
        current_round += 1;

        let response = ollama_client::chat(
            &client,
            &input.model,
            &built_messages,
            input.num_ctx,
        )
        .await
        .map_err(|e| e.to_string())?;

        // Add the assistant's "Thought" or "Tool Call" to the history
        built_messages.push(("assistant".into(), response.clone()));

        let result = tool_router::route_and_execute(&response, wallet, &wallet_addresses).await?;

        match result {
            ToolResult::AssistantMessage { content } => {
                // This is the final answer or a plain text response
                blocks.push(ResponseBlock::Text { content: content.clone() });
                return Ok(ChatAgentResponse::AssistantMessage {
                    content,
                    blocks,
                });
            }
            ToolResult::ToolOutput { tool_name, content } => {
                // Format for the user to see
                let summary = format_tool_result(&tool_name, &content);
                blocks.push(ResponseBlock::Text { content: summary.clone() });
                blocks.push(ResponseBlock::ToolResult {
                    tool_name: tool_name.clone(),
                    content: content.clone(),
                });

                // Add observation to LLM history for next turn
                let observation = format!("Observation from {}: {}", tool_name, content);
                built_messages.push(("user".into(), observation));
                
                // Continue loop for next "Thought"
            }
            ToolResult::ApprovalRequired { tool_name, payload } => {
                let message = build_approval_message(&tool_name, &payload);
                return Ok(ChatAgentResponse::ApprovalRequired {
                    tool_name,
                    payload,
                    message,
                });
            }
            ToolResult::Error { message } => {
                let error_msg = format!("Tool error: {}", message);
                built_messages.push(("user".into(), error_msg));
                // Allow the LLM to try to recover or explain the error
            }
        }
    }
}

