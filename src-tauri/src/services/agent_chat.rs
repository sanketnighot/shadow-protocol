//! Agent chat orchestration: Ollama + tool loop.

use reqwest::Client;
use serde::{Deserialize, Serialize};

use super::ollama_client;
use super::tool_registry;
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

/// Returns true if the user message suggests they want interpretation/analysis, not just raw data.
pub(crate) fn wants_analysis(msg: &str) -> bool {
    let lower = msg.to_lowercase();
    let phrases = [
        "analyze",
        "analysis",
        "compare",
        "what should i do",
        "what should i ",
        "risk",
        "rebalance",
        "how does it look",
        "how does my portfolio",
        "interpret",
        "recommend",
        "suggest",
        "opinion",
        "thoughts on",
    ];
    phrases.iter().any(|p| lower.contains(p))
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
    let agent_ctx = AgentContext {
        wallet_count: wallet_addresses.len() as u32,
        active_address: input.wallet_address.clone(),
        all_addresses: wallet_addresses.clone(),
    };
    let mut tools_prompt = tool_router::tools_system_prompt(&agent_ctx);
    if let Some(ref facts) = input.structured_facts {
        if !facts.trim().is_empty() {
            tools_prompt.push_str("\n\n## RECENT TOOL FACTS (use for follow-ups like \"analyze it\", \"compare with X\")\n\n");
            tools_prompt.push_str(facts.trim());
        }
    }

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

    let last_user_msg: Option<&str> = input
        .messages
        .iter()
        .rev()
        .find(|m| m.role.eq_ignore_ascii_case("user"))
        .map(|m| m.content.as_str());

    let round = 0u32;
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
                let def = tool_registry::all_tools()
                    .into_iter()
                    .find(|t| t.name == tool_name);
                let do_synthesis = def
                    .map(|d| d.supports_synthesis)
                    .unwrap_or(false)
                    && last_user_msg.map(wants_analysis).unwrap_or(false);

                let (content, blocks) = if do_synthesis {
                    let mut synthesis_messages = built.clone();
                    synthesis_messages.push((
                        "assistant".into(),
                        format!("TOOL: {}()", tool_name),
                    ));
                    synthesis_messages.push((
                        "user".into(),
                        format!("[Tool result]\n{content}\n\nPlease analyze this."),
                    ));
                    let synthesis_system = "You are Shadow. The user wants analysis of real tool data. Respond with 2-4 concise sentences. Use only the data provided. Never fabricate numbers.";
                    synthesis_messages[0] = ("system".into(), synthesis_system.to_string());

                    let analysis = ollama_client::chat(
                        &client,
                        &input.model,
                        &synthesis_messages,
                        input.num_ctx,
                    )
                    .await
                    .map_err(|e| e.to_string())?;

                    let mut out_blocks = blocks.clone();
                    out_blocks.push(ResponseBlock::ToolResult {
                        tool_name: tool_name.clone(),
                        content: content.clone(),
                    });
                    out_blocks.push(ResponseBlock::Text {
                        content: analysis.trim().to_string(),
                    });
                    (analysis.trim().to_string(), out_blocks)
                } else {
                    let summary = format_tool_result(&tool_name, &content);
                    let mut out_blocks = blocks;
                    out_blocks.push(ResponseBlock::Text {
                        content: summary.clone(),
                    });
                    out_blocks.push(ResponseBlock::ToolResult {
                        tool_name: tool_name.clone(),
                        content: content.clone(),
                    });
                    (summary, out_blocks)
                };

                break Ok(ChatAgentResponse::AssistantMessage { content, blocks });
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

#[cfg(test)]
mod tests {
    use super::wants_analysis;

    #[test]
    fn wants_analysis_returns_true_for_analysis_phrases() {
        assert!(wants_analysis("analyze my portfolio"));
        assert!(wants_analysis("How does it look?"));
        assert!(wants_analysis("What should I do with my holdings?"));
        assert!(wants_analysis("compare ETH with BTC"));
        assert!(wants_analysis("rebalance recommendations"));
        assert!(wants_analysis("risk assessment"));
        assert!(wants_analysis("your thoughts on this?"));
    }

    #[test]
    fn wants_analysis_returns_false_for_simple_data_asks() {
        assert!(!wants_analysis("what's my portfolio worth?"));
        assert!(!wants_analysis("ETH price?"));
        assert!(!wants_analysis("show balances"));
        assert!(!wants_analysis("hello"));
    }
}
