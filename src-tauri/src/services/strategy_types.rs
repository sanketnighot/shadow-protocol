use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StrategyNodeType {
    Trigger,
    Condition,
    Action,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyNodePosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyDraftNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: StrategyNodeType,
    pub position: StrategyNodePosition,
    pub data: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyDraftEdge {
    pub id: String,
    pub source: String,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyDraft {
    pub id: Option<String>,
    pub name: String,
    pub summary: Option<String>,
    pub template: String,
    pub mode: String,
    pub nodes: Vec<StrategyDraftNode>,
    pub edges: Vec<StrategyDraftEdge>,
    pub guardrails: StrategyGuardrails,
    pub approval_policy: StrategyApprovalPolicy,
    pub execution_policy: StrategyExecutionPolicy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetAllocationSpec {
    pub symbol: String,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StrategyTrigger {
    TimeInterval {
        interval: String,
        anchor_timestamp: Option<i64>,
        timezone: Option<String>,
    },
    DriftThreshold {
        drift_pct: f64,
        evaluation_interval_seconds: Option<i64>,
        target_allocations: Vec<TargetAllocationSpec>,
    },
    Threshold {
        metric: String,
        operator: String,
        value: f64,
        asset_symbol: Option<String>,
        evaluation_interval_seconds: Option<i64>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StrategyCondition {
    PortfolioFloor {
        min_portfolio_usd: f64,
    },
    MaxGas {
        max_gas_usd: f64,
    },
    MaxSlippage {
        max_slippage_bps: u32,
    },
    WalletAssetAvailable {
        symbol: String,
        min_amount: f64,
    },
    Cooldown {
        cooldown_seconds: i64,
    },
    DriftMinimum {
        min_drift_pct: f64,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StrategyAction {
    DcaBuy {
        chain: String,
        from_symbol: String,
        to_symbol: String,
        amount_usd: Option<f64>,
        amount_token: Option<f64>,
    },
    RebalanceToTarget {
        chain: String,
        threshold_pct: f64,
        max_execution_usd: Option<f64>,
        target_allocations: Vec<TargetAllocationSpec>,
    },
    AlertOnly {
        title: String,
        message_template: String,
        severity: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyGuardrails {
    pub max_per_trade_usd: f64,
    pub max_daily_notional_usd: f64,
    pub require_approval_above_usd: f64,
    pub min_portfolio_usd: f64,
    pub cooldown_seconds: i64,
    pub allowed_chains: Vec<String>,
    pub token_allowlist: Option<Vec<String>>,
    pub token_denylist: Option<Vec<String>>,
    pub max_slippage_bps: Option<u32>,
    pub max_gas_usd: Option<f64>,
}

impl Default for StrategyGuardrails {
    fn default() -> Self {
        Self {
            max_per_trade_usd: 1_000.0,
            max_daily_notional_usd: 2_500.0,
            require_approval_above_usd: 250.0,
            min_portfolio_usd: 0.0,
            cooldown_seconds: 300,
            allowed_chains: vec!["ethereum".to_string(), "base".to_string(), "polygon".to_string()],
            token_allowlist: None,
            token_denylist: None,
            max_slippage_bps: Some(50),
            max_gas_usd: Some(25.0),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyApprovalPolicy {
    pub mode: String,
    pub require_approval_above_usd: Option<f64>,
}

impl Default for StrategyApprovalPolicy {
    fn default() -> Self {
        Self {
            mode: "always_require".to_string(),
            require_approval_above_usd: Some(0.0),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyExecutionPolicy {
    pub enabled: bool,
    pub fallback_to_approval: bool,
    pub kill_switch: bool,
}

impl Default for StrategyExecutionPolicy {
    fn default() -> Self {
        Self {
            enabled: false,
            fallback_to_approval: true,
            kill_switch: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyValidationIssue {
    pub code: String,
    pub severity: String,
    pub message: String,
    pub field_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledStrategyPlan {
    pub strategy_id: String,
    pub version: i64,
    pub template: String,
    pub trigger: StrategyTrigger,
    pub conditions: Vec<StrategyCondition>,
    pub action: StrategyAction,
    pub normalized_guardrails: StrategyGuardrails,
    pub valid: bool,
    pub validation_errors: Vec<StrategyValidationIssue>,
    pub warnings: Vec<StrategyValidationIssue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyEvaluationPreview {
    pub would_trigger: bool,
    pub condition_results: Vec<StrategyConditionPreview>,
    pub execution_mode: String,
    pub expected_action_summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyConditionPreview {
    pub code: String,
    pub passed: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategySimulationResult {
    pub strategy_id: Option<String>,
    pub valid: bool,
    pub plan: Option<CompiledStrategyPlan>,
    pub evaluation_preview: StrategyEvaluationPreview,
    pub message: String,
}

pub fn default_preview(execution_mode: &str, expected_action_summary: String) -> StrategyEvaluationPreview {
    StrategyEvaluationPreview {
        would_trigger: false,
        condition_results: Vec::new(),
        execution_mode: execution_mode.to_string(),
        expected_action_summary,
    }
}

