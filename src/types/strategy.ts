// Mirrors Rust IPC types for the strategy builder (camelCase serde).

export type StrategyMode = "monitor_only" | "approval_required" | "pre_authorized";

export type StrategyStatus =
  | "draft"
  | "active"
  | "paused"
  | "invalid"
  | "failed"
  | "archived";

export type StrategyTemplate = "dca_buy" | "rebalance_to_target" | "alert_only";

export type StrategyNodeType = "trigger" | "condition" | "action";

export type TargetAllocationRow = {
  symbol: string;
  percentage: number;
};

/** Flow Cadence on-chain scheduling hints on DCA / rebalance (see Rust `FlowOnChainSpec`). */
export type FlowOnChainSpec = {
  enabled?: boolean;
  cronExpression?: string | null;
  oneShotTimestamp?: number | null;
  handlerType?: string | null;
};

/** Draft node `data` — matches `DraftNodeData` in Rust. */
export type DraftNodeData =
  | {
      type: "time_interval";
      interval: string;
      anchorTimestamp?: number | null;
      timezone?: string | null;
    }
  | {
      type: "drift_threshold";
      driftPct: number;
      evaluationIntervalSeconds?: number | null;
      targetAllocations: TargetAllocationRow[];
    }
  | {
      type: "threshold";
      metric: string;
      operator: string;
      value: number;
      evaluationIntervalSeconds?: number | null;
    }
  | { type: "cooldown"; cooldownSeconds: number }
  | { type: "portfolio_floor"; minPortfolioUsd: number }
  | { type: "max_gas"; maxGasUsd: number }
  | { type: "max_slippage"; maxSlippageBps: number }
  | { type: "wallet_asset_available"; symbol: string; minAmount: number }
  | { type: "drift_minimum"; minDriftPct: number }
  | {
      type: "dca_buy";
      chain: string;
      fromSymbol: string;
      toSymbol: string;
      amountUsd?: number | null;
      amountToken?: number | null;
      flowOnChain?: FlowOnChainSpec | null;
    }
  | {
      type: "rebalance_to_target";
      chain: string;
      thresholdPct: number;
      maxExecutionUsd?: number | null;
      targetAllocations: TargetAllocationRow[];
      flowOnChain?: FlowOnChainSpec | null;
    }
  | {
      type: "alert_only";
      title: string;
      messageTemplate: string;
      severity: string;
    };

export type StrategyNodeData = DraftNodeData;

export type StrategyDraftNode = {
  id: string;
  type: StrategyNodeType;
  position: { x: number; y: number };
  data: DraftNodeData;
};

export type StrategyDraftEdge = {
  id: string;
  source: string;
  target: string;
};

export type StrategyGuardrails = {
  maxPerTradeUsd?: number;
  maxDailyNotionalUsd?: number;
  requireApprovalAboveUsd?: number;
  minPortfolioUsd?: number;
  cooldownSeconds?: number;
  allowedChains?: string[];
  tokenAllowlist?: string[] | null;
  tokenDenylist?: string[] | null;
  maxSlippageBps?: number;
  maxGasUsd?: number;
};

export type StrategyApprovalPolicy = {
  mode?: string;
  requireApprovalAboveUsd?: number;
};

export type StrategyExecutionPolicy = {
  enabled?: boolean;
  fallbackToApproval?: boolean;
  killSwitch?: boolean;
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

// --- Compiled plan (`kind` tag matches Rust serde) ---

export type TargetAllocationSpec = {
  symbol: string;
  percentage: number;
};

export type CompiledStrategyTrigger =
  | {
      kind: "time_interval";
      interval: string;
      anchorTimestamp?: number | null;
      timezone?: string | null;
    }
  | {
      kind: "drift_threshold";
      driftPct: number;
      evaluationIntervalSeconds?: number | null;
      targetAllocations: TargetAllocationSpec[];
    }
  | {
      kind: "threshold";
      metric: string;
      operator: string;
      value: number;
      evaluationIntervalSeconds?: number | null;
    };

export type CompiledStrategyCondition =
  | { kind: "portfolio_floor"; minPortfolioUsd: number }
  | { kind: "max_gas"; maxGasUsd: number }
  | { kind: "max_slippage"; maxSlippageBps: number }
  | { kind: "wallet_asset_available"; symbol: string; minAmount: number }
  | { kind: "cooldown"; cooldownSeconds: number }
  | { kind: "drift_minimum"; minDriftPct: number };

export type CompiledStrategyAction =
  | {
      kind: "dca_buy";
      chain: string;
      fromSymbol: string;
      toSymbol: string;
      amountUsd?: number | null;
      amountToken?: number | null;
    }
  | {
      kind: "rebalance_to_target";
      chain: string;
      thresholdPct: number;
      targetAllocations: TargetAllocationSpec[];
      maxExecutionUsd?: number | null;
    }
  | {
      kind: "alert_only";
      title: string;
      messageTemplate: string;
      severity: string;
    }
  | {
      kind: "flow_scheduled";
      chain: string;
      handler_type: string;
      cron_expression?: string | null;
      one_shot_timestamp?: number | null;
      handler_params: Record<string, unknown>;
    }
  | {
      kind: "flow_dca_buy";
      fromVault: string;
      toVault: string;
      amount: number;
      swapperProtocol: string;
      maxSlippageBps: number;
    }
  | {
      kind: "flow_rebalance";
      targetAllocations: TargetAllocationSpec[];
      swapperProtocol: string;
      maxExecutionUsd?: number | null;
    }
  | {
      kind: "flow_flash_loan_arbitrage";
      flasherProtocol: string;
      loanToken: string;
      loanAmount: number;
      swapRoute: Array<{ fromSymbol: string; toSymbol: string }>;
    };

export type CompiledStrategyPlan = {
  strategyId: string;
  version: number;
  template: StrategyTemplate;
  trigger: CompiledStrategyTrigger;
  conditions: CompiledStrategyCondition[];
  action: CompiledStrategyAction;
  normalizedGuardrails: StrategyGuardrails;
  valid: boolean;
  validationErrors: StrategyValidationIssue[];
  warnings: StrategyValidationIssue[];
};

export type StrategyValidationIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  fieldPath?: string;
};

export type StrategySimulationResult = {
  strategyId?: string;
  valid: boolean;
  plan?: CompiledStrategyPlan;
  evaluationPreview: {
    wouldTrigger: boolean;
    conditionResults: Array<{ code: string; passed: boolean; message: string }>;
    executionMode: StrategyMode;
    expectedActionSummary: string;
  };
  message: string;
};

/** Row from `active_strategies` (Tauri camelCase). */
export type ActiveStrategy = {
  id: string;
  name: string;
  summary?: string | null;
  status: string;
  template: string;
  mode: string;
  version: number;
  triggerJson: string;
  actionJson: string;
  guardrailsJson: string;
  draftGraphJson: string;
  compiledPlanJson: string;
  validationState: string;
  lastSimulationJson?: string | null;
  lastExecutionStatus?: string | null;
  lastExecutionReason?: string | null;
  approvalPolicyJson: string;
  executionPolicyJson: string;
  failureCount: number;
  lastEvaluationAt?: number | null;
  disabledReason?: string | null;
  lastRunAt?: number | null;
  nextRunAt?: number | null;
  updatedAt?: number | null;
};

export type StrategyDetailResult = {
  strategy: ActiveStrategy;
  draft?: StrategyDraft | null;
  plan?: CompiledStrategyPlan | null;
};

export type StrategyExecutionRecord = {
  id: string;
  strategyId: string;
  status: string;
  reason?: string | null;
  approvalId?: string | null;
  toolExecutionId?: string | null;
  createdAt: number;
};
