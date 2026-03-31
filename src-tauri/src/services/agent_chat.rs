//! Agent chat orchestration: deterministic advice pipeline + tool loop.

use reqwest::Client;
use serde::{Deserialize, Serialize};

use super::audit;
use super::ai_kernel;
use super::local_db::{self, ApprovalRecord};
use super::ollama_client;
use super::tool_router::{self, AgentContext, ToolResult};
use tauri::AppHandle;

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
    /// Rolling summary for older messages when the frontend has compacted the thread.
    pub rolling_summary: Option<String>,
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
        #[serde(rename = "approvalId")]
        approval_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        #[serde(rename = "approvalKind")]
        approval_kind: String,
        payload: serde_json::Value,
        message: String,
        expires_at: Option<i64>,
        version: i64,
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
        Err(_) => return "Data received. See details below.".to_string(),
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

fn approval_kind(tool_name: &str) -> String {
    match tool_name {
        "execute_token_swap" => "swap",
        "create_automation_strategy" => "strategy_create",
        "flow_protocol_prepare_sponsored_transaction" => "flow_tx",
        "flow_schedule_transaction" | "flow_setup_recurring" | "flow_cancel_scheduled" => {
            "flow_schedule"
        }
        "flow_compose_defi_action" => "flow_actions",
        "flow_bridge_tokens" => "flow_bridge",
        "filecoin_protocol_request_backup" => "filecoin_backup",
        "filecoin_protocol_request_restore" => "filecoin_restore",
        _ => "tool_action",
    }
    .to_string()
}

pub async fn run_agent(input: ChatAgentInput, app: &AppHandle) -> Result<ChatAgentResponse, String> {
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

    let request = ai_kernel::AiKernelRequest {
        profile: super::ai_profiles::AiProfileId::ChatAssistant,
        model: input.model.clone(),
        messages: input
            .messages
            .iter()
            .map(|message| ai_kernel::AiKernelMessage {
                role: if message.role == "assistant" {
                    "assistant".to_string()
                } else {
                    "user".to_string()
                },
                content: message.content.clone(),
            })
            .collect(),
        num_ctx: input.num_ctx,
        rolling_summary: input.rolling_summary.clone(),
        structured_facts: input.structured_facts.clone(),
        agent_context: agent_ctx.clone(),
    };
    let mut built_messages: Vec<(String, String)> = ai_kernel::build_request_messages(app, &request);

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
            ai_kernel::resolve_num_ctx(&request),
        )
        .await
        .map_err(|e| e.to_string())?;

        // Add the assistant's "Thought" or "Tool Call" to the history
        built_messages.push(("assistant".into(), response.clone()));

        let results = tool_router::route_and_execute(app, &response, wallet, &wallet_addresses).await?;

        let mut has_tools = false;
        let mut final_content = String::new();

        for result in results {
            match result {
                ToolResult::AssistantMessage { content } => {
                    blocks.push(ResponseBlock::Text { content: content.clone() });
                    if final_content.is_empty() {
                        final_content = content;
                    } else {
                        final_content = format!("{}\n\n{}", final_content, content);
                    }
                }
                ToolResult::ToolOutput { tool_name, content } => {
                    has_tools = true;
                    let summary = format_tool_result(&tool_name, &content);
                    blocks.push(ResponseBlock::Text { content: summary.clone() });
                    blocks.push(ResponseBlock::ToolResult {
                        tool_name: tool_name.clone(),
                        content: content.clone(),
                    });

                    let observation = ai_kernel::compact_tool_observation(&tool_name, &content);
                    built_messages.push(("user".into(), observation));
                }
                ToolResult::ApprovalRequired { tool_name, payload } => {
                    let message = build_approval_message(&tool_name, &payload);
                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs() as i64)
                        .unwrap_or(0);
                    let approval = ApprovalRecord {
                        id: uuid::Uuid::new_v4().to_string(),
                        source: "agent_chat".to_string(),
                        tool_name: tool_name.clone(),
                        kind: approval_kind(&tool_name),
                        status: "pending".to_string(),
                        payload_json: payload.to_string(),
                        simulation_json: Some(
                            serde_json::json!({
                                "validated": true,
                                "toolName": tool_name,
                            })
                            .to_string(),
                        ),
                        policy_json: Some(serde_json::json!({"mode": "always_require"}).to_string()),
                        message: message.clone(),
                        expires_at: Some(now + 15 * 60),
                        version: 1,
                        strategy_id: None,
                        created_at: now,
                        updated_at: now,
                    };
                    local_db::insert_approval_request(&approval).map_err(|e| e.to_string())?;
                    audit::record("approval_created", "approval_request", Some(&approval.id), &approval);
                    return Ok(ChatAgentResponse::ApprovalRequired {
                        approval_id: approval.id,
                        tool_name,
                        approval_kind: approval.kind,
                        payload,
                        message,
                        expires_at: approval.expires_at,
                        version: approval.version,
                    });
                }
                ToolResult::Error { message } => {
                    has_tools = true;
                    let error_msg = format!("Tool error: {}", message);
                    built_messages.push(("user".into(), error_msg.clone()));
                    blocks.push(ResponseBlock::Text { content: error_msg });
                }
            }
        }

        if !has_tools {
            // Trigger autonomous Filecoin backup in background if active
            let app_clone = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = crate::services::apps::filecoin::trigger_autonomous_backup(&app_clone).await;
            });

            return Ok(ChatAgentResponse::AssistantMessage {
                content: if final_content.is_empty() { response } else { final_content },
                blocks,
            });
        }
    }
}
