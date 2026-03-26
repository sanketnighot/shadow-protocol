import { describe, expect, it, vi } from "vitest";

import { compileStrategyDraft, createDefaultDraft } from "@/lib/strategy";
import { getOrderedPipelineNodes } from "@/lib/strategyPipeline";
import type { StrategySimulationResult } from "@/types/strategy";

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("strategy lib", () => {
  it("createDefaultDraft(dca_buy) is a linear trigger → condition → action graph", () => {
    const d = createDefaultDraft("dca_buy");
    expect(d.template).toBe("dca_buy");
    expect(d.nodes.filter((n) => n.type === "trigger")).toHaveLength(1);
    expect(d.nodes.filter((n) => n.type === "condition")).toHaveLength(1);
    expect(d.nodes.filter((n) => n.type === "action")).toHaveLength(1);
    expect(d.edges).toHaveLength(2);
    expect(d.edges[0]?.source).toBe("trigger-1");
    expect(d.edges[1]?.target).toBe("action-1");
  });

  it("getOrderedPipelineNodes follows edges trigger → … → action", () => {
    const d = createDefaultDraft("dca_buy");
    const ordered = getOrderedPipelineNodes(d);
    expect(ordered.map((n) => n.id)).toEqual(["trigger-1", "condition-1", "action-1"]);
  });

  it("compileStrategyDraft sends draft to strategy_compile_draft", async () => {
    const draft = createDefaultDraft("dca_buy");
    const sim = {
      strategyId: "preview",
      valid: true,
      evaluationPreview: {
        wouldTrigger: false,
        conditionResults: [],
        executionMode: "approval_required" as const,
        expectedActionSummary: "ok",
      },
      message: "ok",
    } satisfies StrategySimulationResult;
    mockInvoke.mockResolvedValueOnce(sim);

    const out = await compileStrategyDraft(draft);
    expect(out).toEqual(sim);
    expect(mockInvoke).toHaveBeenCalledWith("strategy_compile_draft", {
      input: { draft },
    });
  });
});
