//! Routes tool requests from model output and dispatches execution.

use serde::Serialize;

use super::tool_registry;
use super::tools::{
    get_total_portfolio_value, get_total_portfolio_value_multi, get_token_price,
    get_wallet_balances, get_wallet_balances_multi, prepare_swap_preview,
};

/// Format: TOOL: name(param1=value1, param2=value2)
pub(crate) fn parse_tool_call(text: &str) -> Option<(String, Vec<(String, String)>)> {
    let prefix = "TOOL:";
    let text = text.trim();
    let rest = text.strip_prefix(prefix)?.trim();
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
    if !has_addresses && address.is_empty() && def.name != "get_token_price" {
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

pub fn tools_system_prompt() -> String {
    let names = tool_registry::tool_names();
    let list = names.join(", ");
    format!(
        r#"You are Shadow, a DeFi assistant in a privacy-first crypto app. Be concise and helpful.

## CRITICAL: BREVITY AND FORMATTING

- Keep responses SHORT: 1-4 sentences usually. Never write long lists or repeat yourself.
- For "what can you do?" / "hello" / "hi": One brief sentence. Do NOT enumerate every capability. Do NOT repeat similar items.
- Use simple formatting: short paragraphs, occasional line breaks. No bullet-point dumps of 10+ items.
- Prefer conversational tone. Answer the question directly, then stop.

## WHEN TO USE TOOLS

Casual chat, greetings, general questions → plain text only. NO tool.
Live data (balances, prices, portfolio value, swaps) → output ONLY: TOOL: tool_name(params)
When using a tool, your response must be ONLY that TOOL: line. No other text.

Available tools: {list}
- get_wallet_balances()
- get_total_portfolio_value()
- get_token_price(tokenSymbol=ETH)
- execute_token_swap(fromToken=USDC, toToken=ETH, amount=100, chain=ETH, slippage=1)

## EXAMPLES (follow these lengths)

User: "hello" → Hi! I'm Shadow. I can check your portfolio, prices, or help with swaps. What do you need?
User: "what can you do?" → I help with portfolio balances, token prices, and swaps—all on-device and private. Ask me anything.
User: "how does a DCA work?" → Dollar-cost averaging means buying a fixed amount at regular intervals to smooth out price volatility. I can help you set one up—want details?
User: "portfolio?" → TOOL: get_total_portfolio_value()
User: "ETH price?" → TOOL: get_token_price(tokenSymbol=ETH)

Never make up financial data. Never write long repetitive lists."#
    )
}
