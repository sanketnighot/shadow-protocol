//! Routes tool requests from model output and dispatches execution.

use serde::{Deserialize, Serialize};

use super::tool_registry;
use super::tools::{
    get_total_portfolio_value, get_total_portfolio_value_multi, get_token_price,
    get_wallet_balances, get_wallet_balances_multi, prepare_swap_preview,
};
use super::local_db;
use super::sonar_client;

#[derive(Debug, Deserialize)]
pub struct ToolCall {
    pub name: String,
    pub parameters: serde_json::Value,
}

/// Parses a JSON tool call from the LLM output.
/// Expects format: {"name": "tool_name", "parameters": {...}}
pub(crate) fn parse_tool_call(text: &str) -> Option<ToolCall> {
    // LLMs sometimes wrap JSON in markdown blocks
    let cleaned = if let Some(start) = text.find("```json") {
        let end = text[start..].find("```")?;
        &text[start + 7..start + end]
    } else if let Some(start) = text.find('{') {
        let end = text.rfind('}')?;
        &text[start..=end]
    } else {
        text
    };

    serde_json::from_str(cleaned.trim()).ok()
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ToolResult {
    AssistantMessage { content: String },
    ToolOutput {
        tool_name: String,
        content: String,
    },
    ApprovalRequired {
        tool_name: String,
        payload: serde_json::Value,
    },
    Error { message: String },
}

pub async fn route_and_execute(
    model_output: &str,
    wallet_address: Option<&str>,
    wallet_addresses: &[String],
) -> Result<ToolResult, String> {
    let call = match parse_tool_call(model_output) {
        Some(c) => c,
        None => {
            return Ok(ToolResult::AssistantMessage {
                content: model_output.to_string(),
            });
        }
    };

    let def = tool_registry::all_tools()
        .into_iter()
        .find(|t| t.name == call.name)
        .ok_or_else(|| format!("Unknown tool: {}", call.name))?;

    let has_addresses = !wallet_addresses.is_empty();
    let address = wallet_address.unwrap_or(wallet_addresses.first().map(String::as_str).unwrap_or(""));
    if def.requires_wallet && !has_addresses && address.is_empty() {
        return Ok(ToolResult::Error {
            message: "No wallet address. Please connect a wallet first.".to_string(),
        });
    }

    match def.name {
        "get_wallet_balances" => {
            let addrs: Vec<&str> = wallet_addresses
                .iter()
                .map(String::as_str)
                .filter(|s| !s.is_empty())
                .collect();
            let res = if addrs.is_empty() {
                get_wallet_balances(address).await
            } else {
                get_wallet_balances_multi(&addrs).await
            };
            let res = res.map_err(|e| e.to_string())?;
            let content = serde_json::to_string(&res).unwrap_or_else(|_| "[]".into());
            Ok(ToolResult::ToolOutput {
                tool_name: def.name.to_string(),
                content,
            })
        }
        "get_total_portfolio_value" => {
            let addrs: Vec<&str> = wallet_addresses
                .iter()
                .map(String::as_str)
                .filter(|s| !s.is_empty())
                .collect();
            let res = if addrs.is_empty() {
                get_total_portfolio_value(address).await
            } else {
                get_total_portfolio_value_multi(&addrs).await
            };
            let content = serde_json::to_string(&res).unwrap_or_else(|_| "{}".into());
            Ok(ToolResult::ToolOutput {
                tool_name: def.name.to_string(),
                content,
            })
        }
        "get_token_price" => {
            let symbol = call.parameters.get("tokenSymbol")
                .and_then(|v| v.as_str())
                .unwrap_or("ETH");
            let res = get_token_price(symbol).await.map_err(|e| e.to_string())?;
            let content = serde_json::to_string(&res).unwrap_or_else(|_| "{}".into());
            Ok(ToolResult::ToolOutput {
                tool_name: def.name.to_string(),
                content,
            })
        }
        "web_research" => {
            let query = call.parameters.get("query")
                .and_then(|v| v.as_str())
                .ok_or("Missing query for web_research")?;
            let res = sonar_client::search(query).await?;
            Ok(ToolResult::ToolOutput {
                tool_name: def.name.to_string(),
                content: res,
            })
        }
        "analyze_portfolio_history" => {
            let limit = call.parameters.get("limit")
                .and_then(|v| v.as_u64())
                .unwrap_or(10) as u32;
            let snapshots = local_db::get_portfolio_snapshots(limit).map_err(|e| e.to_string())?;
            let content = serde_json::to_string(&snapshots).unwrap_or_else(|_| "[]".into());
            Ok(ToolResult::ToolOutput {
                tool_name: def.name.to_string(),
                content,
            })
        }
        "execute_token_swap" => {
            let from = call.parameters.get("fromToken").and_then(|v| v.as_str()).unwrap_or("USDC");
            let to = call.parameters.get("toToken").and_then(|v| v.as_str()).unwrap_or("ETH");
            let amount = call.parameters.get("amount").and_then(|v| v.as_str()).unwrap_or("0");
            let chain = call.parameters.get("chain").and_then(|v| v.as_str()).unwrap_or("ETH");
            let slippage = call.parameters.get("slippage").and_then(|v| v.as_f64());

            let preview = prepare_swap_preview(from, to, amount, chain, slippage)?;
            let payload = serde_json::to_value(&preview).unwrap_or(serde_json::json!({}));

            Ok(ToolResult::ApprovalRequired {
                tool_name: def.name.to_string(),
                payload,
            })
        }
        _ => Err(format!("Unknown tool: {}", def.name)),
    }
}

/// Runtime context injected into the system prompt so the LLM knows what app state exists.
#[derive(Debug, Clone)]
pub struct AgentContext {
    pub wallet_count: u32,
    pub active_address: Option<String>,
    pub all_addresses: Vec<String>,
}

impl AgentContext {
    pub fn has_wallets(&self) -> bool {
        self.wallet_count > 0
    }

    pub fn is_multi_wallet(&self) -> bool {
        self.wallet_count > 1
    }
}

pub fn tools_system_prompt(ctx: &AgentContext) -> String {
    let tools = tool_registry::all_tools();
    let tools_json = serde_json::to_string_pretty(&tools.iter().map(|t| {
        serde_json::json!({
            "name": t.name,
            "description": t.description,
            "parameters": serde_json::from_str::<serde_json::Value>(t.parameters).unwrap_or(serde_json::json!({"type": "object"}))
        })
    }).collect::<Vec<_>>()).unwrap_or_else(|_| "[]".to_string());

    let ctx_block = if ctx.has_wallets() {
        let multi = if ctx.is_multi_wallet() { " (multi-wallet; aggregate by default)" } else { "" };
        format!(
            r#"
## APP CONTEXT (auto-inject; NEVER ask user for this)

- Connected wallets: {}{}
- Active wallet: {}
- Addresses for tools: {}
- You have direct access. Call tools automatically. Never say "I don't have access", "please provide", "you should call"."#,
            ctx.wallet_count,
            multi,
            ctx.active_address
                .as_deref()
                .unwrap_or("(first of connected)"),
            ctx.all_addresses
                .iter()
                .map(|a| {
                    if a.len() > 12 {
                        format!("{}…{}", &a[..6], &a[a.len() - 4..])
                    } else {
                        a.clone()
                    }
                })
                .collect::<Vec<_>>()
                .join(", ")
        )
    } else {
        r#"
## APP CONTEXT
- No wallets connected. For portfolio/balance questions: output "Decision: hold. Reason: No wallet context. Connect a wallet in Settings to enable portfolio." For token price (e.g. ETH price?): call get_token_price() — no wallet needed."#
            .to_string()
    };

    format!(
        r#"You are an autonomous DeFi execution agent. You have direct access to tools.

You DO NOT ask the user to call tools.
You DO NOT ask for missing data.
You DO NOT say you lack access.

Instead: automatically call tools when needed, process results, return a final decision.

You are NOT a chatbot. You observe, analyze, decide, output.

FORBIDDEN: "please call", "you should call", "try using", "provide wallet address", "I don't have access".

When using a tool, you MUST output ONLY a valid JSON object in the following format:
{{"name": "tool_name", "parameters": {{"param1": "value1"}}}}

{ctx_block}

Available tools:
{tools_json}

Examples:
"portfolio?" → {{"name": "get_total_portfolio_value", "parameters": {{}}}}
"ETH price?" → {{"name": "get_token_price", "parameters": {{"tokenSymbol": "ETH"}}}}
"is ARB risky?" → {{"name": "web_research", "parameters": {{"query": "Arbitrum project risks and latest news March 2026"}}}}
"hello" → Hi! I'm Shadow. I can analyze your portfolio, research the web, or help with swaps. What do you need?"#
    )
}
