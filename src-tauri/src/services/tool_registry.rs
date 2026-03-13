//! Central registry of agent tools with schema and execution.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolKind {
    Read,
    Write,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ToolDef {
    pub name: &'static str,
    pub kind: ToolKind,
    pub description: &'static str,
}

pub fn all_tools() -> Vec<ToolDef> {
    vec![
        ToolDef {
            name: "get_wallet_balances",
            kind: ToolKind::Read,
            description: "Get all token balances across connected chains for a wallet address.",
        },
        ToolDef {
            name: "get_total_portfolio_value",
            kind: ToolKind::Read,
            description: "Get total portfolio value in USD and per-token breakdown.",
        },
        ToolDef {
            name: "get_token_price",
            kind: ToolKind::Read,
            description: "Get current USD price for a token symbol (e.g. ETH, USDC).",
        },
        ToolDef {
            name: "execute_token_swap",
            kind: ToolKind::Write,
            description: "Swap one token for another. Requires user approval.",
        },
    ]
}

pub fn tool_names() -> Vec<&'static str> {
    all_tools().into_iter().map(|t| t.name).collect()
}
