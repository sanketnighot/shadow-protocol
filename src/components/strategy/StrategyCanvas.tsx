import {
  applyNodeChanges,
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useMemo } from "react";
import "@xyflow/react/dist/style.css";

import { ActionNode } from "@/components/strategy/nodes/ActionNode";
import { ConditionNode } from "@/components/strategy/nodes/ConditionNode";
import { TriggerNode } from "@/components/strategy/nodes/TriggerNode";
import type { StrategyDraft, StrategyTemplate } from "@/types/strategy";

const nodeTypes = {
  action: ActionNode,
  condition: ConditionNode,
  trigger: TriggerNode,
};

type StrategyCanvasProps = {
  draft: StrategyDraft;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onUpdateNodePositions: (
    nodes: Array<{ id: string; position: { x: number; y: number } }>,
  ) => void;
  onAddCondition: () => void;
  onResetTemplate: (template: StrategyTemplate) => void;
  onRemoveSelected: () => void;
};

function nodeLabel(data: StrategyDraft["nodes"][number]["data"]) {
  switch (data.type) {
    case "time_interval":
      return {
        title:
          data.interval.charAt(0).toUpperCase() + data.interval.slice(1),
        subtitle: data.timezone ?? "UTC",
      };
    case "drift_threshold":
      return {
        title: `Drift >= ${data.driftPct}%`,
        subtitle: `${data.targetAllocations.length} target allocations`,
      };
    case "threshold":
      return {
        title: `Portfolio ${data.operator.toUpperCase()} ${data.value}`,
        subtitle: data.metric,
      };
    case "portfolio_floor":
      return {
        title: `Portfolio >= $${data.minPortfolioUsd}`,
        subtitle: "Portfolio floor guard",
      };
    case "max_gas":
      return {
        title: `Gas <= $${data.maxGasUsd}`,
        subtitle: "Max gas threshold",
      };
    case "max_slippage":
      return {
        title: `Slippage <= ${data.maxSlippageBps} bps`,
        subtitle: "Route slippage guard",
      };
    case "wallet_asset_available":
      return {
        title: `${data.symbol} >= ${data.minAmount}`,
        subtitle: "Wallet balance check",
      };
    case "cooldown":
      return {
        title: `Cooldown ${data.cooldownSeconds}s`,
        subtitle: "Prevent repeat execution",
      };
    case "drift_minimum":
      return {
        title: `Drift >= ${data.minDriftPct}%`,
        subtitle: "Only act above drift threshold",
      };
    case "dca_buy":
      return {
        title: `Buy ${data.toSymbol}`,
        subtitle: data.amountUsd ? `$${data.amountUsd} from ${data.fromSymbol}` : `${data.fromSymbol} -> ${data.toSymbol}`,
      };
    case "rebalance_to_target":
      return {
        title: "Rebalance to Target",
        subtitle: `${data.targetAllocations.length} target weights`,
      };
    case "alert_only":
      return {
        title: data.title,
        subtitle: data.severity,
      };
  }
}

export function StrategyCanvas({
  draft,
  selectedNodeId,
  onSelectNode,
  onUpdateNodePositions,
  onAddCondition,
  onResetTemplate,
  onRemoveSelected,
}: StrategyCanvasProps) {
  const nodes = useMemo<Node[]>(
    () =>
      draft.nodes.map((node) => {
        const label = nodeLabel(node.data);
        return {
          id: node.id,
          type: node.type,
          position: node.position,
          selected: node.id === selectedNodeId,
          data: {
            title: label.title,
            subtitle: label.subtitle,
            selected: node.id === selectedNodeId,
          },
        };
      }),
    [draft.nodes, selectedNodeId],
  );

  const edges = useMemo<Edge[]>(
    () =>
      draft.edges.map((edge) => ({
        ...edge,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
      })),
    [draft.edges],
  );

  return (
    <div className="glass-panel rounded-sm">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onAddCondition}
            className="inline-flex items-center gap-2 rounded-sm border border-border bg-secondary px-3 py-2 text-xs font-semibold tracking-[0.18em] text-foreground uppercase transition-all hover:bg-surface-elevated"
          >
            <Plus className="size-3.5" />
            Add condition
          </button>
          <button
            type="button"
            onClick={onRemoveSelected}
            disabled={!selectedNodeId || selectedNodeId === "trigger-1"}
            className="inline-flex items-center gap-2 rounded-sm border border-border bg-secondary px-3 py-2 text-xs font-semibold tracking-[0.18em] text-foreground uppercase transition-all hover:bg-surface-elevated disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
            Remove step
          </button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 rounded-sm border border-border bg-secondary px-3 py-2 text-xs font-semibold tracking-[0.18em] text-muted uppercase">
            Template
            <select
              aria-label="Strategy template"
              value={draft.template}
              onChange={(event) =>
                onResetTemplate(event.currentTarget.value as StrategyTemplate)
              }
              className="bg-transparent text-foreground outline-none"
            >
              <option value="dca_buy">DCA</option>
              <option value="rebalance_to_target">Rebalance</option>
              <option value="alert_only">Alert</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => onResetTemplate(draft.template)}
            className="inline-flex items-center gap-2 rounded-sm border border-border bg-secondary px-3 py-2 text-xs font-semibold tracking-[0.18em] text-foreground uppercase transition-all hover:bg-surface-elevated"
          >
            <RotateCcw className="size-3.5" />
            Reset template
          </button>
        </div>
      </div>

      <div className="h-[420px]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          nodesConnectable={false}
          elementsSelectable
          onNodesChange={(changes: NodeChange[]) => {
            const nextNodes = applyNodeChanges(changes, nodes);
            onUpdateNodePositions(
              nextNodes.map((node) => ({
                id: node.id,
                position: { x: node.position.x, y: node.position.y },
              })),
            );
          }}
          onNodeClick={(_, node) => onSelectNode(node.id)}
          fitView
          minZoom={0.6}
        >
          <MiniMap />
          <Controls />
          <Background gap={24} />
        </ReactFlow>
      </div>
    </div>
  );
}
