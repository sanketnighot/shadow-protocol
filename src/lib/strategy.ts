import { invoke } from "@tauri-apps/api/core";

import type {
  ActiveStrategy,
  StrategyDetailResult,
  StrategyDraft,
  StrategyExecutionRecord,
  StrategySimulationResult,
  StrategyTemplate,
} from "@/types/strategy";
import { hasTauriRuntime } from "@/lib/tauri";

export function createDefaultDraft(template: StrategyTemplate = "dca_buy"): StrategyDraft {
  const base = {
    id: undefined,
    name:
      template === "dca_buy"
        ? "Weekly ETH DCA"
        : template === "rebalance_to_target"
          ? "Stablecoin Rebalance"
          : "Portfolio Alert",
    summary:
      template === "dca_buy"
        ? "Buy ETH on a fixed interval with strict guardrails."
        : template === "rebalance_to_target"
          ? "Restore allocation drift toward the target profile."
          : "Notify me when a monitored portfolio threshold is hit.",
    template,
    mode: "approval_required" as const,
    guardrails: {
      maxPerTradeUsd: 1_000,
      maxDailyNotionalUsd: 2_500,
      requireApprovalAboveUsd: 250,
      minPortfolioUsd: 0,
      cooldownSeconds: 300,
      allowedChains: ["ethereum", "base", "polygon"],
      tokenAllowlist: null,
      tokenDenylist: null,
      maxSlippageBps: 50,
      maxGasUsd: 25,
    },
    approvalPolicy: {
      mode: "always_require" as const,
      requireApprovalAboveUsd: 250,
    },
    executionPolicy: {
      enabled: false,
      fallbackToApproval: true,
      killSwitch: false,
    },
  };

  if (template === "rebalance_to_target") {
    return {
      ...base,
      nodes: [
        {
          id: "trigger-1",
          type: "trigger",
          position: { x: 0, y: 60 },
          data: {
            type: "drift_threshold",
            driftPct: 5,
            evaluationIntervalSeconds: 300,
            targetAllocations: [
              { symbol: "ETH", percentage: 50 },
              { symbol: "USDC", percentage: 50 },
            ],
          },
        },
        {
          id: "condition-1",
          type: "condition",
          position: { x: 280, y: 60 },
          data: { type: "cooldown", cooldownSeconds: 300 },
        },
        {
          id: "action-1",
          type: "action",
          position: { x: 560, y: 60 },
          data: {
            type: "rebalance_to_target",
            chain: "multi_chain",
            thresholdPct: 5,
            maxExecutionUsd: 750,
            targetAllocations: [
              { symbol: "ETH", percentage: 50 },
              { symbol: "USDC", percentage: 50 },
            ],
          },
        },
      ],
      edges: [
        { id: "edge-1", source: "trigger-1", target: "condition-1" },
        { id: "edge-2", source: "condition-1", target: "action-1" },
      ],
    };
  }

  if (template === "alert_only") {
    return {
      ...base,
      mode: "monitor_only",
      nodes: [
        {
          id: "trigger-1",
          type: "trigger",
          position: { x: 0, y: 60 },
          data: {
            type: "threshold",
            metric: "portfolio_value_usd",
            operator: "lte",
            value: 5_000,
            evaluationIntervalSeconds: 300,
          },
        },
        {
          id: "action-1",
          type: "action",
          position: { x: 320, y: 60 },
          data: {
            type: "alert_only",
            title: "Portfolio Floor Breach",
            messageTemplate: "Portfolio value fell below the configured threshold.",
            severity: "warning",
          },
        },
      ],
      edges: [{ id: "edge-1", source: "trigger-1", target: "action-1" }],
    };
  }

  return {
    ...base,
    nodes: [
      {
        id: "trigger-1",
        type: "trigger",
        position: { x: 0, y: 60 },
        data: {
          type: "time_interval",
          interval: "weekly",
          anchorTimestamp: null,
          timezone: "UTC",
        },
      },
      {
        id: "condition-1",
        type: "condition",
        position: { x: 280, y: 60 },
        data: { type: "cooldown", cooldownSeconds: 300 },
      },
      {
        id: "action-1",
        type: "action",
        position: { x: 560, y: 60 },
        data: {
          type: "dca_buy",
          chain: "ethereum",
          fromSymbol: "USDC",
          toSymbol: "ETH",
          amountUsd: 100,
          amountToken: null,
        },
      },
    ],
    edges: [
      { id: "edge-1", source: "trigger-1", target: "condition-1" },
      { id: "edge-2", source: "condition-1", target: "action-1" },
    ],
  };
}

export async function compileStrategyDraft(
  draft: StrategyDraft,
): Promise<StrategySimulationResult> {
  return invoke("strategy_compile_draft", { input: { draft } });
}

export async function createStrategyFromDraft(
  draft: StrategyDraft,
  status: string,
): Promise<ActiveStrategy> {
  const result = await invoke<{ strategy: ActiveStrategy }>(
    "strategy_create_from_draft",
    { input: { draft, status } },
  );
  return result.strategy;
}

export async function updateStrategyFromDraft(
  id: string,
  draft: StrategyDraft,
  status: string,
): Promise<ActiveStrategy> {
  const result = await invoke<{ strategy: ActiveStrategy }>(
    "strategy_update_from_draft",
    { input: { id, draft, status } },
  );
  return result.strategy;
}

export async function getStrategyDetail(id: string): Promise<StrategyDetailResult> {
  return invoke("strategy_get", { input: { id } });
}

export async function getStrategyExecutionHistory(
  strategyId?: string,
): Promise<StrategyExecutionRecord[]> {
  return invoke("strategy_get_execution_history", {
    input: { strategyId, limit: 50 },
  });
}

export function strategyBuilderAvailable(): boolean {
  return hasTauriRuntime();
}
