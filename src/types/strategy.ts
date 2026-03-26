export type StrategyMode =
  | "monitor_only"
  | "approval_required"
  | "pre_authorized";

export type StrategyStatus =
  | "draft"
  | "active"
  | "paused"
  | "invalid"
  | "failed"
  | "archived";

export type StrategyTemplate =
  | "dca_buy"
  | "rebalance_to_target"
  | "alert_only";

export type StrategyNodeType = "trigger" | "condition" | "action";

export type StrategyNodePosition = {
  x: number;
  y: number;
};

export type TargetAllocationSpec = {
  symbol: string;
  percentage: number;
};

export type TimeTrigger = {
  type: "time_interval";
  interval: "hourly" | "daily" | "weekly" | "monthly";
  anchorTimestamp?: number | null;
  timezone?: string | null;
};

export type DriftTrigger = {
  type: "drift_threshold";
  driftPct: number;
  evaluationIntervalSeconds?: number | null;
  targetAllocations: TargetAllocationSpec[];
};

export type ThresholdTrigger = {
  type: "threshold";
  metric: "portfolio_value_usd";
  operator: "gte" | "lte";
  value: number;
  assetSymbol?: string | null;
  evaluationIntervalSeconds?: number | null;
};

export type StrategyTrigger = TimeTrigger | DriftTrigger | ThresholdTrigger;

export type PortfolioFloorCondition = {
  type: "portfolio_floor";
  minPortfolioUsd: number;
};

export type MaxGasCondition = {
  type: "max_gas";
  maxGasUsd: number;
};

export type MaxSlippageCondition = {
  type: "max_slippage";
  maxSlippageBps: number;
};

export type WalletAssetAvailableCondition = {
  type: "wallet_asset_available";
  symbol: string;
  minAmount: number;
};

export type CooldownCondition = {
  type: "cooldown";
  cooldownSeconds: number;
};

export type DriftMinimumCondition = {
  type: "drift_minimum";
  minDriftPct: number;
};

export type StrategyCondition =
  | PortfolioFloorCondition
  | MaxGasCondition
  | MaxSlippageCondition
  | WalletAssetAvailableCondition
  | CooldownCondition
  | DriftMinimumCondition;

export type DcaBuyAction = {
  type: "dca_buy";
  chain: "ethereum" | "base" | "polygon";
  fromSymbol: string;
  toSymbol: string;
  amountUsd?: number | null;
  amountToken?: number | null;
};

export type RebalanceToTargetAction = {
  type: "rebalance_to_target";
  chain: "ethereum" | "base" | "polygon" | "multi_chain";
  thresholdPct: number;
  maxExecutionUsd?: number | null;
  targetAllocations: TargetAllocationSpec[];
};

export type AlertOnlyAction = {
  type: "alert_only";
  title: string;
  messageTemplate: string;
  severity: "info" | "warning" | "critical";
};

export type StrategyAction =
  | DcaBuyAction
  | RebalanceToTargetAction
  | AlertOnlyAction;

export type StrategyNodeData =
  | StrategyTrigger
  | StrategyCondition
  | StrategyAction;

export type StrategyDraftNode = {
  id: string;
  type: StrategyNodeType;
  position: StrategyNodePosition;
  data: StrategyNodeData;
};

export type StrategyDraftEdge = {
  id: string;
  source: string;
  target: string;
};

export type StrategyGuardrails = {
  maxPerTradeUsd: number;
  maxDailyNotionalUsd: number;
  requireApprovalAboveUsd: number;
  minPortfolioUsd: number;
  cooldownSeconds: number;
  allowedChains: string[];
  tokenAllowlist?: string[] | null;
  tokenDenylist?: string[] | null;
  maxSlippageBps?: number | null;
  maxGasUsd?: number | null;
};

export type StrategyApprovalPolicy = {
  mode: "always_require" | "require_above_amount";
  requireApprovalAboveUsd?: number | null;
};

export type StrategyExecutionPolicy = {
  enabled: boolean;
  fallbackToApproval: boolean;
  killSwitch: boolean;
};

export type StrategyDraft = {
  id?: string;
  name: string;
  summary?: string;
  template: StrategyTemplate;
  mode: StrategyMode;
  nodes: StrategyDraftNode[];
  edges: StrategyDraftEdge[];
  guardrails: StrategyGuardrails;
  approvalPolicy: StrategyApprovalPolicy;
  executionPolicy: StrategyExecutionPolicy;
};

export type StrategyValidationIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  fieldPath?: string;
};

export type CompiledStrategyPlan = {
  strategyId: string;
  version: number;
  template: StrategyTemplate;
  trigger: StrategyTrigger;
  conditions: StrategyCondition[];
  action: StrategyAction;
  normalizedGuardrails: StrategyGuardrails;
  valid: boolean;
  validationErrors: StrategyValidationIssue[];
  warnings: StrategyValidationIssue[];
};

export type StrategyConditionPreview = {
  code: string;
  passed: boolean;
  message: string;
};

export type StrategySimulationResult = {
  strategyId?: string;
  valid: boolean;
  plan?: CompiledStrategyPlan | null;
  evaluationPreview: {
    wouldTrigger: boolean;
    conditionResults: StrategyConditionPreview[];
    executionMode:
      | "no_op"
      | "approval_required"
      | "pre_authorized"
      | "monitor_only";
    expectedActionSummary: string;
  };
  message: string;
};

export type StrategyExecutionRecord = {
  id: string;
  strategyId: string;
  status:
    | "evaluated"
    | "approval_created"
    | "executing"
    | "succeeded"
    | "failed"
    | "skipped";
  reason?: string | null;
  approvalId?: string | null;
  toolExecutionId?: string | null;
  createdAt: number;
};

export type PersistedStrategy = {
  id: string;
  name: string;
  summary?: string | null;
  status: string;
  template: string;
  mode: StrategyMode;
  version: number;
  validationState: string;
  failureCount: number;
  disabledReason?: string | null;
  nextRunAt?: number | null;
  lastRunAt?: number | null;
  lastEvaluationAt?: number | null;
  lastExecutionStatus?: string | null;
  lastExecutionReason?: string | null;
};

export type StrategyDetailResult = {
  strategy: PersistedStrategy;
  draft?: StrategyDraft | null;
  plan?: CompiledStrategyPlan | null;
};
