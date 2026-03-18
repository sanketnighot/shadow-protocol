//! Central registry of agent tools with schema and execution metadata.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolKind {
    Read,
    Write,
}

/// Execution mode for tool dispatch.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExecutionMode {
    /// Execute immediately; no user approval.
    ReadAuto,
    /// Must wait for user approval before execution.
    ApprovalRequired,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ToolDef {
    pub name: &'static str,
    pub kind: ToolKind,
    pub description: &'static str,
    pub parameters: &'static str, // JSON Schema string
    pub execution_mode: ExecutionMode,
    pub requires_wallet: bool,
    pub supports_multi_wallet: bool,
    pub supports_synthesis: bool,
    pub example: &'static str,
}

pub fn all_tools() -> Vec<ToolDef> {
    vec![
        ToolDef {
            name: "get_wallet_balances",
            kind: ToolKind::Read,
            description: "Get all token balances across connected chains.",
            parameters: r#"{"type": "object", "properties": {}}"#,
            execution_mode: ExecutionMode::ReadAuto,
            requires_wallet: true,
            supports_multi_wallet: true,
            supports_synthesis: true,
            example: "get_wallet_balances()",
        },
        ToolDef {
            name: "get_total_portfolio_value",
            kind: ToolKind::Read,
            description: "Get total portfolio value in USD and per-token breakdown.",
            parameters: r#"{"type": "object", "properties": {}}"#,
            execution_mode: ExecutionMode::ReadAuto,
            requires_wallet: true,
            supports_multi_wallet: true,
            supports_synthesis: true,
            example: "get_total_portfolio_value()",
        },
        ToolDef {
            name: "get_token_price",
            kind: ToolKind::Read,
            description: "Get current USD price for a token symbol.",
            parameters: r#"{"type": "object", "properties": {"tokenSymbol": {"type": "string", "description": "e.g. ETH, BTC, USDC"}}, "required": ["tokenSymbol"]}"#,
            execution_mode: ExecutionMode::ReadAuto,
            requires_wallet: false,
            supports_multi_wallet: false,
            supports_synthesis: true,
            example: "get_token_price(tokenSymbol=ETH)",
        },
        ToolDef {
            name: "web_research",
            kind: ToolKind::Read,
            description: "Search the web for real-time market news, catalysts, or project details. Use this for up-to-date intelligence.",
            parameters: r#"{"type": "object", "properties": {"query": {"type": "string", "description": "Search query"}}, "required": ["query"]}"#,
            execution_mode: ExecutionMode::ReadAuto,
            requires_wallet: false,
            supports_multi_wallet: false,
            supports_synthesis: true,
            example: "web_research(query=\"Ethereum price action catalysts this week\")",
        },
        ToolDef {
            name: "analyze_portfolio_history",
            kind: ToolKind::Read,
            description: "Fetch historical portfolio snapshots to analyze performance, TWR, and PnL trends.",
            parameters: r#"{"type": "object", "properties": {"limit": {"type": "integer", "description": "Number of recent snapshots to fetch", "default": 10}}}"#,
            execution_mode: ExecutionMode::ReadAuto,
            requires_wallet: true,
            supports_multi_wallet: true,
            supports_synthesis: true,
            example: "analyze_portfolio_history(limit=5)",
        },
        ToolDef {
            name: "execute_token_swap",
            kind: ToolKind::Write,
            description: "Swap one token for another. Requires user approval.",
            parameters: r#"{"type": "object", "properties": {"fromToken": {"type": "string"}, "toToken": {"type": "string"}, "amount": {"type": "string"}, "chain": {"type": "string"}, "slippage": {"type": "number"}}, "required": ["fromToken", "toToken", "amount", "chain"]}"#,
            execution_mode: ExecutionMode::ApprovalRequired,
            requires_wallet: true,
            supports_multi_wallet: false,
            supports_synthesis: false,
            example: "execute_token_swap(fromToken=USDC, toToken=ETH, amount=100, chain=ETH)",
        },
    ]
}

