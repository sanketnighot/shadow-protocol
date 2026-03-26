import { useEffect, useMemo, useState } from "react";

import {
  compileStrategyDraft,
  createDefaultDraft,
  createStrategyFromDraft,
  getStrategyDetail,
  updateStrategyFromDraft,
} from "@/lib/strategy";
import type {
  StrategyDraft,
  StrategyDraftEdge,
  StrategyDraftNode,
  StrategyNodeData,
  StrategyTemplate,
  StrategySimulationResult,
} from "@/types/strategy";
import { hasTauriRuntime } from "@/lib/tauri";

function createConditionNode(index: number): StrategyDraftNode {
  return {
    id: `condition-${index}`,
    type: "condition",
    position: { x: 280 * index, y: 60 },
    data: { type: "cooldown", cooldownSeconds: 300 },
  };
}

function rebuildLinearEdges(nodes: StrategyDraftNode[]): StrategyDraftEdge[] {
  return nodes.slice(0, -1).map((node, index) => ({
    id: `edge-${index + 1}`,
    source: node.id,
    target: nodes[index + 1].id,
  }));
}

export function useStrategyBuilder(strategyId: string | null) {
  const [draft, setDraft] = useState<StrategyDraft>(createDefaultDraft());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>("trigger-1");
  const [simulation, setSimulation] = useState<StrategySimulationResult | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(strategyId));
  const [persistedStatus, setPersistedStatus] = useState<string>("draft");
  const [failureCount, setFailureCount] = useState<number>(0);
  const strategyBuilderEnabled = hasTauriRuntime();

  useEffect(() => {
    if (!strategyId || !strategyBuilderEnabled) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    getStrategyDetail(strategyId)
      .then((detail) => {
        if (cancelled) return;
        if (detail.draft) {
          setDraft(detail.draft);
        }
        setPersistedStatus(detail.strategy.status);
        setFailureCount(detail.strategy.failureCount);
        setSimulation(
          detail.plan
            ? {
                strategyId: detail.plan.strategyId,
                valid: detail.plan.valid,
                plan: detail.plan,
                evaluationPreview: {
                  wouldTrigger: false,
                  conditionResults: [],
                  executionMode:
                    detail.strategy.mode === "monitor_only"
                      ? "monitor_only"
                      : detail.strategy.mode === "pre_authorized"
                        ? "pre_authorized"
                        : "approval_required",
                  expectedActionSummary: detail.strategy.summary ?? "Compiled strategy plan available.",
                },
                message: detail.plan.valid
                  ? "Compiled strategy loaded."
                  : "Strategy needs repair before activation.",
              }
            : null,
        );
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [strategyBuilderEnabled, strategyId]);

  useEffect(() => {
    if (!strategyBuilderEnabled) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setIsCompiling(true);
      void compileStrategyDraft(draft)
        .then((result) => setSimulation(result))
        .finally(() => setIsCompiling(false));
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [draft, strategyBuilderEnabled]);

  const selectedNode = useMemo(
    () => draft.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [draft.nodes, selectedNodeId],
  );

  const setTemplate = (template: StrategyTemplate) => {
    const nextDraft = createDefaultDraft(template);
    nextDraft.id = draft.id;
    nextDraft.name = draft.name.trim().length >= 3 ? draft.name : nextDraft.name;
    nextDraft.summary =
      draft.summary && draft.summary.trim().length > 0
        ? draft.summary
        : nextDraft.summary;
    setDraft(nextDraft);
    setSelectedNodeId(nextDraft.nodes[0]?.id ?? null);
  };

  const updateDraftMeta = (patch: Partial<Pick<StrategyDraft, "name" | "summary" | "mode">>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const updateGuardrails = (patch: Partial<StrategyDraft["guardrails"]>) => {
    setDraft((current) => ({
      ...current,
      guardrails: { ...current.guardrails, ...patch },
    }));
  };

  const updateNodeData = (nodeId: string, nextData: StrategyNodeData) => {
    setDraft((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === nodeId ? { ...node, data: nextData } : node,
      ),
    }));
  };

  const updateNodePositions = (
    nodes: Array<Pick<StrategyDraftNode, "id" | "position">>,
  ) => {
    setDraft((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        const updated = nodes.find((item) => item.id === node.id);
        return updated ? { ...node, position: updated.position } : node;
      }),
    }));
  };

  const addCondition = () => {
    setDraft((current) => {
      const actionNode = current.nodes.find((node) => node.type === "action");
      const nonActionNodes = current.nodes.filter((node) => node.type !== "action");
      const nextCondition = createConditionNode(nonActionNodes.length);
      const nodes = actionNode
        ? [...nonActionNodes, nextCondition, actionNode].map((node, index) => ({
            ...node,
            position: { x: index * 280, y: 60 },
          }))
        : [...nonActionNodes, nextCondition].map((node, index) => ({
            ...node,
            position: { x: index * 280, y: 60 },
          }));
      return {
        ...current,
        nodes,
        edges: rebuildLinearEdges(nodes),
      };
    });
  };

  const removeSelectedNode = () => {
    if (!selectedNode || selectedNode.type === "trigger") {
      return;
    }
    setDraft((current) => {
      const nodes = current.nodes
        .filter((node) => node.id !== selectedNode.id)
        .map((node, index) => ({
          ...node,
          position: { x: index * 280, y: 60 },
        }));
      return {
        ...current,
        nodes,
        edges: rebuildLinearEdges(nodes),
      };
    });
    setSelectedNodeId("trigger-1");
  };

  const save = async (status: "draft" | "active") => {
    if (!strategyBuilderEnabled) {
      return null;
    }
    setIsSaving(true);
    try {
      const strategy = draft.id
        ? await updateStrategyFromDraft(draft.id, draft, status)
        : await createStrategyFromDraft(draft, status);
      setPersistedStatus(strategy.status);
      setFailureCount(strategy.failureCount);
      if (!draft.id) {
        setDraft((current) => ({ ...current, id: strategy.id }));
      }
      return strategy;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    draft,
    selectedNode,
    selectedNodeId,
    setSelectedNodeId,
    simulation,
    isCompiling,
    isSaving,
    isLoading,
    persistedStatus,
    failureCount,
    strategyBuilderEnabled,
    setTemplate,
    updateDraftMeta,
    updateGuardrails,
    updateNodeData,
    updateNodePositions,
    addCondition,
    removeSelectedNode,
    saveDraft: () => save("draft"),
    activateStrategy: () => save("active"),
  };
}
