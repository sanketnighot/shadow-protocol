import { invoke } from "@tauri-apps/api/core";

import type {
  Task,
  TaskStats,
  GuardrailConfig,
  HealthAlert,
  PortfolioHealth,
  MatchedOpportunity,
  OrchestratorState,
} from "@/types/autonomous";

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// Task API
export async function getPendingTasks(): Promise<Task[]> {
  if (!hasTauriRuntime()) return [];
  const result = await invoke<{
    tasks: Array<{
      id: string;
      category: string;
      priority: string;
      status: string;
      title: string;
      summary: string;
      reasoning: {
        trigger: string;
        analysis: string;
        recommendation: string;
        riskFactors: string[];
      };
      suggestedAction: {
        actionType: string;
        chain?: string;
        tokenIn?: string;
        tokenOut?: string;
        amount?: number;
        amountUsd?: number;
        targetAddress?: string;
        parameters?: Record<string, unknown>;
      };
      confidenceScore: number;
      sourceTrigger: string;
      createdAt: number;
      expiresAt?: number;
    }>;
    stats: TaskStats;
    error?: string;
  }>("get_pending_tasks");
  
  if (result.error) {
    console.error("get_pending_tasks error:", result.error);
    return [];
  }
  
  return result.tasks.map(t => ({
    id: t.id,
    category: t.category,
    priority: t.priority as Task["priority"],
    status: t.status as Task["status"],
    title: t.title,
    summary: t.summary,
    reasoning: {
      trigger: t.reasoning.trigger,
      analysis: t.reasoning.analysis,
      recommendation: t.reasoning.recommendation,
      riskFactors: t.reasoning.riskFactors,
    },
    suggestedAction: {
      actionType: t.suggestedAction.actionType,
      chain: t.suggestedAction.chain,
      tokenIn: t.suggestedAction.tokenIn,
      tokenOut: t.suggestedAction.tokenOut,
      amount: t.suggestedAction.amount,
      amountUsd: t.suggestedAction.amountUsd,
      targetAddress: t.suggestedAction.targetAddress,
      parameters: t.suggestedAction.parameters ?? {},
    },
    confidenceScore: t.confidenceScore,
    sourceTrigger: t.sourceTrigger,
    createdAt: t.createdAt,
    expiresAt: t.expiresAt,
  }));
}

export async function getTask(_taskId: string): Promise<Task | null> {
  // Not implemented in backend, return null
  console.warn("getTask not implemented");
  return null;
}

export async function approveTask(taskId: string, reason?: string): Promise<Task | null> {
  const result = await invoke<{
    success: boolean;
    task?: {
      id: string;
      category: string;
      priority: string;
      status: string;
      title: string;
      summary: string;
      reasoning: {
        trigger: string;
        analysis: string;
        recommendation: string;
        riskFactors: string[];
      };
      suggestedAction: {
        actionType: string;
        chain?: string;
        tokenIn?: string;
        tokenOut?: string;
        amount?: number;
        amountUsd?: number;
        targetAddress?: string;
      };
      confidenceScore: number;
      sourceTrigger: string;
      createdAt: number;
      expiresAt?: number;
    };
    error?: string;
  }>("approve_task", { input: { taskId, reason: reason ?? null } });
  
  if (!result.success || !result.task) {
    throw new Error(result.error ?? "Failed to approve task");
  }
  
  return {
    id: result.task.id,
    category: result.task.category,
    priority: result.task.priority as Task["priority"],
    status: result.task.status as Task["status"],
    title: result.task.title,
    summary: result.task.summary,
    reasoning: {
      trigger: result.task.reasoning.trigger,
      analysis: result.task.reasoning.analysis,
      recommendation: result.task.reasoning.recommendation,
      riskFactors: result.task.reasoning.riskFactors,
    },
    suggestedAction: {
      actionType: result.task.suggestedAction.actionType,
      chain: result.task.suggestedAction.chain,
      tokenIn: result.task.suggestedAction.tokenIn,
      tokenOut: result.task.suggestedAction.tokenOut,
      amount: result.task.suggestedAction.amount,
      amountUsd: result.task.suggestedAction.amountUsd,
      targetAddress: result.task.suggestedAction.targetAddress,
      parameters: {},
    },
    confidenceScore: result.task.confidenceScore,
    sourceTrigger: result.task.sourceTrigger,
    createdAt: result.task.createdAt,
    expiresAt: result.task.expiresAt,
  };
}

export async function rejectTask(taskId: string, reason?: string): Promise<void> {
  const result = await invoke<{
    success: boolean;
    error?: string;
  }>("reject_task", { input: { taskId, reason: reason ?? null } });
  
  if (!result.success) {
    throw new Error(result.error ?? "Failed to reject task");
  }
}

export async function getTaskStats(): Promise<TaskStats> {
  if (!hasTauriRuntime()) {
    return { total: 0, pending: 0, approved: 0, rejected: 0, executing: 0, completed: 0, failed: 0, expired: 0 };
  }
  const result = await invoke<{
    tasks: unknown[];
    stats: TaskStats;
    error?: string;
  }>("get_pending_tasks");
  return result.stats;
}

export async function getTaskReasoning(taskId: string): Promise<string> {
  const result = await invoke<{
    chain?: {
      trigger: string;
      conclusion: string;
      steps: Array<{ reasoning: string }>;
    };
    error?: string;
  }>("get_task_reasoning", { input: { taskId } });
  
  if (result.error || !result.chain) {
    return "No reasoning available";
  }
  
  return result.chain.conclusion;
}

// Guardrails API
export async function getGuardrails(): Promise<GuardrailConfig> {
  if (!hasTauriRuntime()) {
    return {
      blockedTokens: [],
      blockedProtocols: [],
      maxSlippageBps: 300,
      emergencyKillSwitch: false,
    };
  }
  const result = await invoke<{
    config: {
      portfolioFloorUsd?: number;
      maxSingleTxUsd?: number;
      dailySpendLimitUsd?: number;
      weeklySpendLimitUsd?: number;
      allowedChains?: string[];
      blockedTokens?: string[];
      blockedProtocols?: string[];
      requireApprovalAboveUsd?: number;
      maxSlippageBps?: number;
      emergencyKillSwitch: boolean;
    };
    error?: string;
  }>("get_guardrails");
  
  return {
    portfolioFloorUsd: result.config.portfolioFloorUsd,
    maxSingleTxUsd: result.config.maxSingleTxUsd,
    dailySpendLimitUsd: result.config.dailySpendLimitUsd,
    weeklySpendLimitUsd: result.config.weeklySpendLimitUsd,
    allowedChains: result.config.allowedChains,
    blockedTokens: result.config.blockedTokens ?? [],
    blockedProtocols: result.config.blockedProtocols ?? [],
    requireApprovalAboveUsd: result.config.requireApprovalAboveUsd,
    maxSlippageBps: result.config.maxSlippageBps ?? 300,
    emergencyKillSwitch: result.config.emergencyKillSwitch,
  };
}

export async function setGuardrails(config: GuardrailConfig): Promise<void> {
  const result = await invoke<{
    success: boolean;
    error?: string;
  }>("set_guardrails", {
    input: {
      config: {
        portfolioFloorUsd: config.portfolioFloorUsd,
        maxSingleTxUsd: config.maxSingleTxUsd,
        dailySpendLimitUsd: config.dailySpendLimitUsd,
        weeklySpendLimitUsd: config.weeklySpendLimitUsd,
        allowedChains: config.allowedChains,
        blockedTokens: config.blockedTokens,
        blockedProtocols: config.blockedProtocols,
        requireApprovalAboveUsd: config.requireApprovalAboveUsd,
        maxSlippageBps: config.maxSlippageBps,
        emergencyKillSwitch: config.emergencyKillSwitch,
      },
    },
  });
  
  if (!result.success) {
    throw new Error(result.error ?? "Failed to set guardrails");
  }
}

export async function activateKillSwitch(): Promise<void> {
  const result = await invoke<{
    success: boolean;
    active: boolean;
    error?: string;
  }>("activate_kill_switch");
  
  if (!result.success) {
    throw new Error(result.error ?? "Failed to activate kill switch");
  }
}

export async function deactivateKillSwitch(): Promise<void> {
  const result = await invoke<{
    success: boolean;
    active: boolean;
    error?: string;
  }>("deactivate_kill_switch");
  
  if (!result.success) {
    throw new Error(result.error ?? "Failed to deactivate kill switch");
  }
}

// Health Monitor API
export async function getLatestHealth(): Promise<PortfolioHealth | null> {
  if (!hasTauriRuntime()) return null;
  const result = await invoke<{
    health?: {
      overallScore: number;
      driftScore: number;
      concentrationScore: number;
      performanceScore: number;
      riskScore: number;
      componentScores: Array<{ name: string; score: number; weight: number; details: string }>;
      alerts: Array<{
        alertType: string;
        severity: string;
        title: string;
        message: string;
        affectedAssets: string[];
        recommendedAction?: string;
      }>;
      recommendations: string[];
    };
    error?: string;
  }>("get_portfolio_health");
  
  if (result.error || !result.health) {
    return null;
  }
  
  return {
    id: "",
    overallScore: result.health.overallScore,
    driftScore: result.health.driftScore,
    concentrationScore: result.health.concentrationScore,
    performanceScore: result.health.performanceScore,
    riskScore: result.health.riskScore,
    alertsJson: JSON.stringify(result.health.alerts),
    driftJson: "[]",
    recommendationsJson: JSON.stringify(result.health.recommendations),
    createdAt: Date.now(),
  };
}

export async function runHealthCheck(): Promise<void> {
  await invoke("run_analysis_now");
}

export async function getHealthAlerts(): Promise<HealthAlert[]> {
  if (!hasTauriRuntime()) return [];
  const result = await invoke<{
    health?: {
      alerts: Array<{
        alertType: string;
        severity: string;
        title: string;
        message: string;
        affectedAssets: string[];
        recommendedAction?: string;
      }>;
    };
    error?: string;
  }>("get_portfolio_health");
  
  if (result.error || !result.health) {
    return [];
  }
  
  return result.health.alerts.map((a, i) => ({
    id: `alert-${i}`,
    alertType: a.alertType,
    severity: a.severity,
    title: a.title,
    message: a.message,
    affectedAssets: a.affectedAssets,
    recommendedAction: a.recommendedAction,
    createdAt: Date.now(),
  }));
}

// Opportunity Scanner API
export async function getOpportunities(limit = 10): Promise<MatchedOpportunity[]> {
  if (!hasTauriRuntime()) return [];
  const result = await invoke<{
    opportunities: Array<{
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
      matchScore: number;
      matchReasons: string[];
      recommendedAction?: string;
    }>;
    error?: string;
  }>("get_opportunities", { input: { limit } });
  
  if (result.error) {
    return [];
  }
  
  return result.opportunities.map(o => ({
    opportunity: {
      id: o.id,
      opportunityType: o.opportunityType,
      title: o.title,
      description: o.description,
      protocol: o.protocol,
      chain: o.chain,
      tokens: o.tokens,
      apy: o.apy,
      tvlUsd: o.tvlUsd,
      riskLevel: o.riskLevel,
      requirements: [],
    },
    matchScore: o.matchScore,
    matchReasons: o.matchReasons,
    recommendedAction: o.recommendedAction,
  }));
}

export async function runOpportunityScan(): Promise<void> {
  await invoke("run_analysis_now");
}

export async function dismissOpportunity(opportunityId: string): Promise<void> {
  // Not implemented in backend
  console.warn("dismissOpportunity not implemented for", opportunityId);
}

// Orchestrator API
export async function getOrchestratorState(): Promise<OrchestratorState> {
  if (!hasTauriRuntime()) {
    return {
      isRunning: false,
      pendingTasksCount: 0,
      activeStrategiesCount: 0,
    };
  }
  const result = await invoke<{
    state: {
      isRunning: boolean;
      lastCheck?: number;
      nextCheck?: number;
      tasksGenerated: number;
      opportunitiesFound: number;
      healthChecksRun: number;
      errors: string[];
    };
    error?: string;
  }>("get_orchestrator_state");
  
  return {
    isRunning: result.state.isRunning,
    lastHealthCheck: result.state.lastCheck,
    lastOpportunityScan: result.state.lastCheck,
    pendingTasksCount: result.state.tasksGenerated,
    activeStrategiesCount: 0,
  };
}

export async function startOrchestrator(): Promise<void> {
  const result = await invoke<{
    success: boolean;
    isRunning: boolean;
    error?: string;
  }>("start_autonomous");
  
  if (!result.success) {
    throw new Error(result.error ?? "Failed to start orchestrator");
  }
}

export async function stopOrchestrator(): Promise<void> {
  const result = await invoke<{
    success: boolean;
    isRunning: boolean;
    error?: string;
  }>("stop_autonomous");
  
  if (!result.success) {
    throw new Error(result.error ?? "Failed to stop orchestrator");
  }
}
