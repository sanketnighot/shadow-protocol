//! Routes tool requests from model output and dispatches execution.

use serde::Serialize;

use super::tool_registry;
use super::tools::{
    get_total_portfolio_value, get_total_portfolio_value_multi, get_token_price,
    get_wallet_balances, get_wallet_balances_multi, prepare_swap_preview,
};

/// Format: TOOL: name(param1=value1, param2=value2)
/// Matches TOOL: anywhere in text (small models sometimes add intro text)
pub(crate) fn parse_tool_call(text: &str) -> Option<(String, Vec<(String, String)>)> {
    let prefix = "TOOL:";
    let text = text.trim();
    let rest = text
        .find(prefix)
        .map(|i| text[i + prefix.len()..].trim())
        .filter(|s| !s.is_empty())?;
    let paren = rest.find('(')?;
    let name = rest[..paren].trim().to_string();
    let args = rest[paren + 1..].trim_end_matches(')');
    let mut params = Vec::new();
    for pair in args.split(',') {
        let pair = pair.trim();
        if let Some(eq) = pair.find('=') {
            let k = pair[..eq].trim().to_string();
            let v = pair[eq + 1..].trim().trim_matches('"').to_string();
            if !k.is_empty() {
                params.push((k, v));
            }
        }
    }
    Some((name, params))
}

fn get_param(params: &[(String, String)], key: &str) -> Option<String> {
    params
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(key))
        .map(|(_, v)| v.clone())
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
    let (name, params) = match parse_tool_call(model_output) {
        Some(t) => t,
        None => {
            return Ok(ToolResult::AssistantMessage {
                content: model_output.to_string(),
            });
        }
    };

    let def = tool_registry::all_tools()
        .into_iter()
        .find(|t| t.name == name)
        .ok_or_else(|| format!("Unknown tool: {name}"))?;

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
                tool_name: name,
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
                tool_name: name,
                content,
            })
        }
        "get_token_price" => {
            let symbol = get_param(&params, "tokenSymbol")
                .or_else(|| get_param(&params, "token"))
                .unwrap_or_else(|| "ETH".to_string());
            let res = get_token_price(&symbol).await.map_err(|e| e.to_string())?;
            let content = serde_json::to_string(&res).unwrap_or_else(|_| "{}".into());
            Ok(ToolResult::ToolOutput {
                tool_name: name,
                content,
            })
        }
        "execute_token_swap" => {
            let from = get_param(&params, "fromToken").unwrap_or_else(|| "USDC".to_string());
            let to = get_param(&params, "toToken").unwrap_or_else(|| "ETH".to_string());
            let amount = get_param(&params, "amount").unwrap_or_else(|| "0".to_string());
            let chain = get_param(&params, "chain").unwrap_or_else(|| "ETH".to_string());
            let slippage_s = get_param(&params, "slippage");
            let slippage = slippage_s.and_then(|s| s.trim().trim_end_matches('%').parse().ok());

            let preview = prepare_swap_preview(&from, &to, &amount, &chain, slippage)?;
            let payload = serde_json::to_value(&preview).unwrap_or(serde_json::json!({}));

            Ok(ToolResult::ApprovalRequired {
                tool_name: name,
                payload,
            })
        }
        _ => Err(format!("Unknown tool: {name}")),
    }
}

#[cfg(test)]
mod tests {
    use super::parse_tool_call;

    #[test]
    fn parse_tool_call_extracts_name_and_params() {
        let (name, params) = parse_tool_call("TOOL: get_wallet_balances(address=0x123)").unwrap();
        assert_eq!(name, "get_wallet_balances");
        assert_eq!(params, vec![("address".to_string(), "0x123".to_string())]);
    }

    #[test]
    fn parse_tool_call_handles_multiple_params() {
        let (name, params) =
            parse_tool_call("TOOL: get_token_price(tokenSymbol=ETH)").unwrap();
        assert_eq!(name, "get_token_price");
        assert_eq!(params, vec![("tokenSymbol".to_string(), "ETH".to_string())]);
    }

    #[test]
    fn parse_tool_call_returns_none_for_plain_text() {
        assert!(parse_tool_call("Hello, no tool here").is_none());
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
    let list: String = tools
        .iter()
        .map(|t| format!("{} — {}", t.name, t.description))
        .collect::<Vec<_>>()
        .join("\n- ");
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
If portfolio data is needed → call get_total_portfolio_value() or get_wallet_balances() automatically.
If price is needed → call get_token_price(tokenSymbol=X) automatically.
If swap is requested → call execute_token_swap(...) (user approves in app).

FORBIDDEN: "please call", "you should call", "try using", "provide wallet address", "I don't have access".

When using a tool, output ONLY: TOOL: tool_name(params)
Greetings only (hi, hello, what can you do) → plain text, NO tool.

{ctx_block}

Available tools:
- {list}

Examples:
"portfolio?" → TOOL: get_total_portfolio_value()
"what do I have?" → TOOL: get_total_portfolio_value()
"worst thing in my portfolio?" → TOOL: get_total_portfolio_value()
"ETH price?" → TOOL: get_token_price(tokenSymbol=ETH)
"hello" → Hi! I'm Shadow. I can analyze your portfolio, prices, or swaps. What do you need?"#
    )
}

#[cfg(test)]
mod prompt_tests {
    use super::{AgentContext, tools_system_prompt};

    #[test]
    fn tools_system_prompt_includes_wallet_context_when_connected() {
        let ctx = AgentContext {
            wallet_count: 2,
            active_address: Some("0x1234…5678".into()),
            all_addresses: vec!["0xaaaa".into(), "0xbbbb".into()],
        };
        let prompt = tools_system_prompt(&ctx);
        assert!(prompt.contains("Connected wallets: 2"));
        assert!(prompt.contains("multi-wallet"));
        assert!(prompt.contains("0x1234"));
        assert!(prompt.contains("get_total_portfolio_value"));
        assert!(prompt.contains("direct access"));
    }

    #[test]
    fn tools_system_prompt_includes_no_wallet_guidance_when_empty() {
        let ctx = AgentContext {
            wallet_count: 0,
            active_address: None,
            all_addresses: vec![],
        };
        let prompt = tools_system_prompt(&ctx);
        assert!(prompt.contains("No wallets connected"));
        assert!(prompt.contains("get_token_price"));
    }

    #[test]
    fn tools_system_prompt_includes_portfolio_routing_examples() {
        let ctx = AgentContext {
            wallet_count: 1,
            active_address: Some("0xabc".into()),
            all_addresses: vec!["0xabc".into()],
        };
        let prompt = tools_system_prompt(&ctx);
        assert!(prompt.contains("worst thing in my portfolio"));
        assert!(prompt.contains("get_total_portfolio_value"));
        assert!(prompt.contains("portfolio?"));
    }
}
