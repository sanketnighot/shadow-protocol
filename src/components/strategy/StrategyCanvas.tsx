import {
  addEdge,
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import { Plus, RotateCcw } from "lucide-react";
import "@xyflow/react/dist/style.css";

import {
  STRATEGY_TEMPLATE_EDGES,
  STRATEGY_TEMPLATE_NODES,
} from "@/data/mock";
import { ActionNode } from "@/components/strategy/nodes/ActionNode";
import { ConditionNode } from "@/components/strategy/nodes/ConditionNode";
import { TriggerNode } from "@/components/strategy/nodes/TriggerNode";

const nodeTypes = {
  action: ActionNode,
  condition: ConditionNode,
  trigger: TriggerNode,
};

const initialNodes: Node[] = STRATEGY_TEMPLATE_NODES.map((node) => ({
  id: node.id,
  type: node.type,
  position: node.position,
  data: {
    title: node.title,
    subtitle: node.subtitle,
  },
}));

const initialEdges: Edge[] = STRATEGY_TEMPLATE_EDGES.map((edge) => ({
  ...edge,
  markerEnd: {
    type: MarkerType.ArrowClosed,
  },
  animated: true,
}));

const TEMPLATE_PRESETS: Record<string, { nodes: Node[]; edges: Edge[] }> = {
  dca: {
    nodes: initialNodes,
    edges: initialEdges,
  },
  rebalance: {
    nodes: [
      {
        id: "trigger-rebalance",
        type: "trigger",
        position: { x: 0, y: 60 },
        data: { title: "Every Friday", subtitle: "12:00 UTC" },
      },
      {
        id: "condition-rebalance",
        type: "condition",
        position: { x: 280, y: 60 },
        data: { title: "Stablecoins < 40%", subtitle: "Allocation drift check" },
      },
      {
        id: "action-rebalance",
        type: "action",
        position: { x: 560, y: 60 },
        data: { title: "Rebalance treasury", subtitle: "Private bridge + swap" },
      },
    ],
    edges: [
      {
        id: "edge-rebalance-1",
        source: "trigger-rebalance",
        target: "condition-rebalance",
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
      },
      {
        id: "edge-rebalance-2",
        source: "condition-rebalance",
        target: "action-rebalance",
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
      },
    ],
  },
  arbitrage: {
    nodes: [
      {
        id: "trigger-arb",
        type: "trigger",
        position: { x: 0, y: 60 },
        data: { title: "Every 5 min", subtitle: "Spread monitor" },
      },
      {
        id: "condition-arb",
        type: "condition",
        position: { x: 280, y: 60 },
        data: { title: "Spread > 1.5%", subtitle: "Liquidity and gas check" },
      },
      {
        id: "action-arb",
        type: "action",
        position: { x: 560, y: 60 },
        data: { title: "Execute route", subtitle: "Private multi-hop trade" },
      },
    ],
    edges: [
      {
        id: "edge-arb-1",
        source: "trigger-arb",
        target: "condition-arb",
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
      },
      {
        id: "edge-arb-2",
        source: "condition-arb",
        target: "action-arb",
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
      },
    ],
  },
};

const STEP_META = {
  action: { title: "Action step", subtitle: "Execute a guarded move" },
  condition: { title: "Condition step", subtitle: "Check a policy or signal" },
  trigger: { title: "Trigger step", subtitle: "Define a schedule or event" },
} as const;

export function StrategyCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const handleConnect = (connection: Connection) => {
    setEdges((currentEdges) =>
      addEdge(
        {
          ...connection,
          animated: true,
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
        },
        currentEdges,
      ),
    );
  };

  const handleAddStep = (type: keyof typeof STEP_META) => {
    setNodes((currentNodes) => {
      const lastNode = currentNodes[currentNodes.length - 1];
      const nextNodeId = `${type}-${currentNodes.length + 1}`;
      const nextNode: Node = {
        id: nextNodeId,
        type,
        position: lastNode
          ? { x: lastNode.position.x + 280, y: lastNode.position.y }
          : { x: 0, y: 60 },
        data: STEP_META[type],
      };

      if (lastNode) {
        setEdges((currentEdges) =>
          addEdge(
            {
              id: `edge-${lastNode.id}-${nextNodeId}`,
              source: lastNode.id,
              target: nextNodeId,
              animated: true,
              markerEnd: {
                type: MarkerType.ArrowClosed,
              },
            },
            currentEdges,
          ),
        );
      }

      return [...currentNodes, nextNode];
    });
  };

  const handleTemplateChange = (templateKey: keyof typeof TEMPLATE_PRESETS) => {
    const template = TEMPLATE_PRESETS[templateKey];
    setNodes(template.nodes.map((node) => ({ ...node, data: { ...node.data } })));
    setEdges(template.edges.map((edge) => ({ ...edge })));
  };

  return (
    <div className="glass-panel rounded-[24px] border border-white/10">
      <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleAddStep("trigger")}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold tracking-[0.18em] text-foreground uppercase transition-all hover:bg-white/10 active:scale-95"
          >
            <Plus className="size-3.5" />
            Add trigger
          </button>
          <button
            type="button"
            onClick={() => handleAddStep("condition")}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold tracking-[0.18em] text-foreground uppercase transition-all hover:bg-white/10 active:scale-95"
          >
            <Plus className="size-3.5" />
            Add condition
          </button>
          <button
            type="button"
            onClick={() => handleAddStep("action")}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold tracking-[0.18em] text-foreground uppercase transition-all hover:bg-white/10 active:scale-95"
          >
            <Plus className="size-3.5" />
            Add action
          </button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold tracking-[0.18em] text-muted uppercase">
            Template
            <select
              aria-label="Strategy template"
              onChange={(event) =>
                handleTemplateChange(event.currentTarget.value as keyof typeof TEMPLATE_PRESETS)
              }
              className="bg-transparent text-foreground outline-none"
              defaultValue="dca"
            >
              <option value="dca">DCA</option>
              <option value="rebalance">Rebalance</option>
              <option value="arbitrage">Arbitrage</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              setNodes([]);
              setEdges([]);
            }}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold tracking-[0.18em] text-foreground uppercase transition-all hover:bg-white/10 active:scale-95"
          >
            <RotateCcw className="size-3.5" />
            Clear
          </button>
        </div>
      </div>
      <div className="h-[380px] sm:h-[420px] lg:h-[500px]">
      <ReactFlow
        colorMode="dark"
        fitView
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onConnect={handleConnect}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={(_, nextNode) =>
          setNodes((currentNodes) =>
            currentNodes.map((node) =>
              node.id === nextNode.id ? { ...node, position: nextNode.position } : node,
            ),
          )
        }
      >
        <Background gap={20} size={1} />
        <MiniMap />
        <Controls />
      </ReactFlow>
      </div>
    </div>
  );
}
