// Autonomous agent types for frontend

export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "suggested" | "approved" | "rejected" | "executing" | "completed" | "failed" | "dismissed";

export interface TaskAction {
  actionType: string;
  chain?: string;
  tokenIn?: string;
  tokenOut?: string;
  amount?: number;
  amountUsd?: number;
  targetAddress?: string;
  parameters: Record<string, unknown>;
}

export interface TaskReasoning {
  trigger: string;
  analysis: string;
  recommendation: string;
  riskFactors: string[];
}

export interface Task {
  id: string;
  category: string;
  priority: TaskPriority;
  status: TaskStatus;
  title: string;
  summary: string;
  reasoning: TaskReasoning;
  suggestedAction: TaskAction;
  confidenceScore: number;
  sourceTrigger: string;
  expiresAt?: number;
  createdAt: number;
}

export interface TaskStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  executing: number;
  completed: number;
  failed: number;
  expired: number;
}

export interface GuardrailConfig {
  portfolioFloorUsd?: number;
  maxSingleTxUsd?: number;
  dailySpendLimitUsd?: number;
  weeklySpendLimitUsd?: number;
  allowedChains?: string[];
  blockedTokens: string[];
  blockedProtocols: string[];
  executionTimeWindows?: ExecutionWindow[];
  requireApprovalAboveUsd?: number;
  maxSlippageBps: number;
  emergencyKillSwitch: boolean;
}

export interface ExecutionWindow {
  dayOfWeek?: string;
  startHourUtc: number;
  endHourUtc: number;
}

export interface HealthAlert {
  id: string;
  alertType: string;
  severity: string;
  title: string;
  message: string;
  affectedAssets: string[];
  currentValue?: number;
  threshold?: number;
  recommendedAction?: string;
  createdAt: number;
}

export interface DriftAnalysis {
  symbol: string;
  targetPct: number;
  actualPct: number;
  driftPct: number;
  driftDirection: "overweight" | "underweight";
  suggestedAction?: string;
}

export interface PortfolioHealth {
  id: string;
  overallScore: number;
  driftScore: number;
  concentrationScore: number;
  performanceScore: number;
  riskScore: number;
  alertsJson: string;
  driftJson: string;
  recommendationsJson: string;
  createdAt: number;
}

export interface MarketOpportunity {
  id: string;
  opportunityType: string;
  title: string;
  description: string;
  protocol: string;
  chain: string;
  tokens: string[];
  apy?: number;
  tvlUsd?: number;
  riskLevel: string;
  requirements: string[];
  deadline?: number;
  sourceUrl?: string;
}

export interface MatchedOpportunity {
  opportunity: MarketOpportunity;
  matchScore: number;
  matchReasons: string[];
  recommendedAction?: string;
  estimatedValueUsd?: number;
}

export interface OrchestratorState {
  isRunning: boolean;
  lastHealthCheck?: number;
  lastOpportunityScan?: number;
  lastTaskGeneration?: number;
  pendingTasksCount: number;
  activeStrategiesCount: number;
}
