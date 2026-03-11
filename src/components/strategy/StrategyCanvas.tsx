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

  return (
    <div className="glass-panel h-[380px] rounded-[24px] border border-white/10 sm:h-[420px] lg:h-[500px]">
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
  );
}
