/** Chat agent invoke types — must match Rust ChatAgentInput/ChatAgentResponse */

export type ChatMessage = {
  role: string;
  content: string;
};

export type ChatAgentInput = {
  model: string;
  messages: ChatMessage[];
  walletAddress?: string | null;
  walletAddresses?: string[] | null;
  numCtx?: number;
  rollingSummary?: string | null;
  structuredFacts?: string | null;
  demoMode?: boolean;
};

export type AgentApprovalRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "executing"
  | "succeeded"
  | "failed"
  | "expired";

export type AgentApprovalRequest = {
  approvalId: string;
  toolName: string;
  kind: string;
  status: AgentApprovalRequestStatus;
  summary: string;
  riskLevel: "low" | "medium" | "high";
  expiresAt?: number | null;
  policyContext?: Record<string, unknown> | null;
  simulation?: Record<string, unknown> | null;
  payload: unknown;
  createdAt?: number;
  version: number;
};

export type ToolExecutionResult = {
  executionId?: string | null;
  approvalId: string;
  toolName: string;
  status: AgentApprovalRequestStatus;
  message: string;
  txHash?: string | null;
  artifacts?: Record<string, unknown> | null;
  executedAt?: number;
};

export type ResponseBlock =
  | { type: "text"; content: string }
  | { type: "toolResult"; toolName: string; content: string }
  | {
      type: "strategyProposal";
      proposal: {
        name: string;
        summary: string;
        trigger: unknown;
        action: unknown;
        guardrails: unknown;
      };
    }
  | {
      type: "decisionResult";
      insights: Record<string, unknown>;
      decision: Record<string, unknown>;
      simulated: boolean;
    };

export type ChatAgentResponse =
  | {
      kind: "assistantMessage";
      content: string;
      blocks: ResponseBlock[];
    }
  | {
      kind: "approvalRequired";
      approvalId: string;
      toolName: string;
      approvalKind: string;
      payload: SwapPreviewPayload | StrategyProposalPayload | Record<string, unknown>;
      message: string;
      expiresAt?: number | null;
      version: number;
    }
  | {
      kind: "error";
      message: string;
    };

export type SwapPreviewPayload = {
  fromToken: string;
  toToken: string;
  amount: string;
  estimatedOutput: string;
  chain: string;
  slippage: string;
  gasEstimate: string;
};

export type StrategyProposalPayload = {
  name: string;
  summary: string;
  trigger: unknown;
  action: unknown;
  guardrails: unknown;
};

export type ApproveAgentActionInput = {
  approvalId: string;
  toolName: string;
  payload: SwapPreviewPayload | StrategyProposalPayload | Record<string, unknown>;
  expectedVersion: number;
};

export type RejectAgentActionInput = {
  approvalId: string;
  expectedVersion: number;
};

export type ApproveAgentActionResult = {
  success: boolean;
  executionId?: string | null;
  message: string;
  txHash?: string | null;
};

export type RejectAgentActionResult = {
  success: boolean;
  message: string;
};

export type PendingApprovalRecord = {
  id: string;
  source: string;
  toolName: string;
  kind: string;
  status: string;
  payloadJson: string;
  simulationJson?: string | null;
  policyJson?: string | null;
  message: string;
  expiresAt?: number | null;
  version: number;
  strategyId?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type ExecutionLogRecord = {
  id: string;
  approvalId?: string | null;
  strategyId?: string | null;
  toolName: string;
  status: string;
  requestJson: string;
  resultJson?: string | null;
  txHash?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: number;
  completedAt?: number | null;
};

export type AgentSoul = {
  risk_appetite: string;
  preferred_chains: string[];
  persona: string;
  custom_rules: string[];
};

export type AgentMemoryItem = {
  id: string;
  fact: string;
  created_at: number;
};

export type AgentMemory = {
  facts: AgentMemoryItem[];
};
