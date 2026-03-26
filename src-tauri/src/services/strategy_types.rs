//! Canonical strategy DSL: draft (IPC from UI) and compiled execution plan (engine).

use serde::{Deserialize, Serialize};

// --- Core enums (snake_case strings match frontend) ---

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StrategyMode {
    MonitorOnly,
    ApprovalRequired,
    PreAuthorized,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StrategyStatus {
    Draft,
    Active,
    Paused,
    Invalid,
    Failed,
    Archived,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StrategyTemplate {
    DcaBuy,
    RebalanceToTarget,
    AlertOnly,
}

// --- Draft node payloads (camelCase fields from TS) ---

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DraftNodeData {
    #[serde(rename = "time_interval")]
    TimeInterval {
        interval: String,
        #[serde(default)]
        anchor_timestamp: Option<i64>,
        #[serde(default)]
        timezone: Option<String>,
    },
    #[serde(rename = "drift_threshold")]
    DriftThreshold {
        #[serde(rename = "driftPct")]
        drift_pct: f64,
        #[serde(default, rename = "evaluationIntervalSeconds")]
        evaluation_interval_seconds: Option<u64>,
        #[serde(rename = "targetAllocations")]
        target_allocations: Vec<TargetAllocationRow>,
    },
    #[serde(rename = "threshold")]
    Threshold {
        metric: String,
        operator: String,
        value: f64,
        #[serde(default, rename = "evaluationIntervalSeconds")]
        evaluation_interval_seconds: Option<u64>,
    },
    #[serde(rename = "cooldown")]
    Cooldown {
        #[serde(rename = "cooldownSeconds")]
        cooldown_seconds: u64,
    },
    #[serde(rename = "portfolio_floor")]
    PortfolioFloor {
        #[serde(rename = "minPortfolioUsd")]
        min_portfolio_usd: f64,
    },
    #[serde(rename = "max_gas")]
    MaxGas {
        #[serde(rename = "maxGasUsd")]
        max_gas_usd: f64,
    },
    #[serde(rename = "max_slippage")]
    MaxSlippage {
        #[serde(rename = "maxSlippageBps")]
        max_slippage_bps: u32,
    },
    #[serde(rename = "wallet_asset_available")]
    WalletAssetAvailable {
        symbol: String,
        #[serde(rename = "minAmount")]
        min_amount: f64,
    },
    #[serde(rename = "drift_minimum")]
    DriftMinimum {
        #[serde(rename = "minDriftPct")]
        min_drift_pct: f64,
    },
    #[serde(rename = "dca_buy")]
    DcaBuy {
        chain: String,
        #[serde(rename = "fromSymbol")]
        from_symbol: String,
        #[serde(rename = "toSymbol")]
        to_symbol: String,
        #[serde(default, rename = "amountUsd")]
        amount_usd: Option<f64>,
        #[serde(default, rename = "amountToken")]
        amount_token: Option<f64>,
    },
    #[serde(rename = "rebalance_to_target")]
    RebalanceToTarget {
        chain: String,
        #[serde(rename = "thresholdPct")]
        threshold_pct: f64,
        #[serde(default, rename = "maxExecutionUsd")]
        max_execution_usd: Option<f64>,
        #[serde(rename = "targetAllocations")]
        target_allocations: Vec<TargetAllocationRow>,
    },
    #[serde(rename = "alert_only")]
    AlertOnly {
        title: String,
        #[serde(rename = "messageTemplate")]
        message_template: String,
        severity: String,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TargetAllocationRow {
    pub symbol: String,
    pub percentage: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum StrategyNodeType {
    Trigger,
    Condition,
    Action,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StrategyDraftNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: StrategyNodeType,
    pub position: Position,
    pub data: DraftNodeData,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StrategyDraftEdge {
    pub id: String,
    pub source: String,
    pub target: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct StrategyGuardrails {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_per_trade_usd: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_daily_notional_usd: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub require_approval_above_usd: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_portfolio_usd: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cooldown_seconds: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allowed_chains: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_allowlist: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_denylist: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_slippage_bps: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_gas_usd: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct StrategyApprovalPolicy {
    #[serde(default)]
    pub mode: String,
    #[serde(default, rename = "requireApprovalAboveUsd")]
    pub require_approval_above_usd: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StrategyExecutionPolicy {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_true", rename = "fallbackToApproval")]
    pub fallback_to_approval: bool,
    #[serde(default, rename = "killSwitch")]
    pub kill_switch: bool,
}

fn default_true() -> bool {
    true
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

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StrategyDraft {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub summary: Option<String>,
    pub template: StrategyTemplate,
    pub mode: StrategyMode,
    pub nodes: Vec<StrategyDraftNode>,
    pub edges: Vec<StrategyDraftEdge>,
    pub guardrails: StrategyGuardrails,
    #[serde(default)]
    pub approval_policy: StrategyApprovalPolicy,
    #[serde(default)]
    pub execution_policy: StrategyExecutionPolicy,
}

// --- Compiled plan (engine runtime) ---

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TargetAllocationSpec {
    pub symbol: String,
    pub percentage: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum StrategyTrigger {
    TimeInterval {
        interval: String,
        #[serde(default, rename = "anchorTimestamp")]
        anchor_timestamp: Option<i64>,
        #[serde(default)]
        timezone: Option<String>,
    },
    DriftThreshold {
        #[serde(rename = "driftPct")]
        drift_pct: f64,
        #[serde(default, rename = "evaluationIntervalSeconds")]
        evaluation_interval_seconds: Option<u64>,
        #[serde(rename = "targetAllocations")]
        target_allocations: Vec<TargetAllocationSpec>,
    },
    Threshold {
        metric: String,
        operator: String,
        value: f64,
        #[serde(default, rename = "evaluationIntervalSeconds")]
        evaluation_interval_seconds: Option<u64>,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum StrategyCondition {
    PortfolioFloor {
        #[serde(rename = "minPortfolioUsd")]
        min_portfolio_usd: f64,
    },
    MaxGas {
        #[serde(rename = "maxGasUsd")]
        max_gas_usd: f64,
    },
    MaxSlippage {
        #[serde(rename = "maxSlippageBps")]
        max_slippage_bps: u32,
    },
    WalletAssetAvailable {
        symbol: String,
        #[serde(rename = "minAmount")]
        min_amount: f64,
    },
    Cooldown {
        #[serde(rename = "cooldownSeconds")]
        cooldown_seconds: u64,
    },
    DriftMinimum {
        #[serde(rename = "minDriftPct")]
        min_drift_pct: f64,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum StrategyAction {
    DcaBuy {
        chain: String,
        #[serde(rename = "fromSymbol")]
        from_symbol: String,
        #[serde(rename = "toSymbol")]
        to_symbol: String,
        #[serde(default, rename = "amountUsd")]
        amount_usd: Option<f64>,
        #[serde(default, rename = "amountToken")]
        amount_token: Option<f64>,
    },
    RebalanceToTarget {
        chain: String,
        #[serde(rename = "thresholdPct")]
        threshold_pct: f64,
        #[serde(rename = "targetAllocations")]
        target_allocations: Vec<TargetAllocationSpec>,
        #[serde(default, rename = "maxExecutionUsd")]
        max_execution_usd: Option<f64>,
    },
    AlertOnly {
        title: String,
        #[serde(rename = "messageTemplate")]
        message_template: String,
        severity: String,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CompiledStrategyPlan {
    pub strategy_id: String,
    pub version: i64,
    pub template: StrategyTemplate,
    pub trigger: StrategyTrigger,
    pub conditions: Vec<StrategyCondition>,
    pub action: StrategyAction,
    pub normalized_guardrails: StrategyGuardrails,
    pub valid: bool,
    pub validation_errors: Vec<StrategyValidationIssue>,
    pub warnings: Vec<StrategyValidationIssue>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StrategyValidationIssue {
    pub code: String,
    pub severity: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub field_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConditionResult {
    pub code: String,
    pub passed: bool,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StrategyConditionPreview {
    pub code: String,
    pub passed: bool,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EvaluationPreview {
    pub would_trigger: bool,
    pub condition_results: Vec<ConditionResult>,
    pub execution_mode: StrategyMode,
    pub expected_action_summary: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StrategySimulationResult {
    pub strategy_id: Option<String>,
    pub valid: bool,
    pub plan: Option<CompiledStrategyPlan>,
    pub evaluation_preview: EvaluationPreview,
    pub message: String,
}

/// IPC-shaped strategy execution row (no evaluation_json blob in API).
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StrategyExecutionRecordIpc {
    pub id: String,
    pub strategy_id: String,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_execution_id: Option<String>,
    pub created_at: i64,
}
