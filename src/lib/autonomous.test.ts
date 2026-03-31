import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockInvoke, mockListen } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockListen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

import {
  approveTask,
  bindAutonomousListeners,
  getLatestHealth,
  getOrchestratorState,
} from "@/lib/autonomous";

describe("autonomous lib", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockListen.mockReset();
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });
  });

  it("maps orchestrator state from the backend contract", async () => {
    mockInvoke.mockResolvedValueOnce({
      state: {
        isRunning: true,
        lastCheck: 1_700_000_000,
        nextCheck: 1_700_000_300,
        tasksGenerated: 4,
        opportunitiesFound: 7,
        healthChecksRun: 2,
        errors: ["none"],
      },
    });

    await expect(getOrchestratorState()).resolves.toEqual({
      isRunning: true,
      lastCheck: 1_700_000_000,
      nextCheck: 1_700_000_300,
      tasksGenerated: 4,
      opportunitiesFound: 7,
      healthChecksRun: 2,
      errors: ["none"],
    });
  });

  it("maps health drift analysis for the dashboard", async () => {
    mockInvoke.mockResolvedValueOnce({
      health: {
        overallScore: 78,
        driftScore: 65,
        concentrationScore: 80,
        performanceScore: 72,
        riskScore: 60,
        componentScores: [],
        alerts: [],
        driftAnalysis: [
          {
            symbol: "ETH",
            targetPct: 30,
            currentPct: 42,
            driftPct: 12,
            driftDirection: "overweight",
            suggestedAction: "Trim ETH",
          },
        ],
        recommendations: ["Trim ETH"],
        createdAt: 1_700_000_123,
      },
    });

    const result = await getLatestHealth();
    expect(result?.createdAt).toBe(1_700_000_123);
    expect(JSON.parse(result?.driftJson ?? "[]")).toEqual([
      {
        symbol: "ETH",
        targetPct: 30,
        actualPct: 42,
        driftPct: 12,
        driftDirection: "overweight",
        suggestedAction: "Trim ETH",
      },
    ]);
  });

  it("returns approval execution details for task toasts", async () => {
    mockInvoke.mockResolvedValueOnce({
      success: true,
      task: {
        id: "task-1",
        category: "yield",
        priority: "high",
        status: "completed",
        title: "Deploy USDC",
        summary: "Create a strategy for idle USDC.",
        reasoning: {
          trigger: "market_opportunity",
          analysis: "Idle USDC is available.",
          recommendation: "Create the strategy.",
          riskFactors: ["USDC"],
        },
        suggestedAction: {
          actionType: "create_strategy",
          chain: "base",
          tokenIn: "USDC",
          amountUsd: 250,
        },
        confidenceScore: 0.82,
        sourceTrigger: "market_service",
        createdAt: 1_700_000_000,
      },
      message: "Strategy 'Deploy USDC' created from autonomous task.",
      executionStatus: "strategy_created",
    });

    await expect(approveTask("task-1")).resolves.toMatchObject({
      executionStatus: "strategy_created",
      message: "Strategy 'Deploy USDC' created from autonomous task.",
      task: {
        id: "task-1",
        suggestedAction: {
          actionType: "create_strategy",
          parameters: {},
        },
      },
    });
  });

  it("binds autonomous task and orchestrator listeners", async () => {
    const unlisten = vi.fn();
    mockListen.mockResolvedValue(unlisten);

    const cleanup = await bindAutonomousListeners({
      onTasksUpdated: vi.fn(),
      onOrchestratorUpdated: vi.fn(),
    });

    expect(mockListen).toHaveBeenCalledWith(
      "autonomous_tasks_updated",
      expect.any(Function),
    );
    expect(mockListen).toHaveBeenCalledWith(
      "autonomous_task_created",
      expect.any(Function),
    );
    expect(mockListen).toHaveBeenCalledWith(
      "autonomous_orchestrator_updated",
      expect.any(Function),
    );

    cleanup();
    expect(unlisten).toHaveBeenCalledTimes(3);
  });
});
