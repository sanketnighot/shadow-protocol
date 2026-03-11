import { ShieldCheck } from "lucide-react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

type StrategyNodeData = {
  title: string;
  subtitle: string;
};

export function ConditionNode({ data }: NodeProps) {
  const nodeData = data as StrategyNodeData;

  return (
    <div className="min-w-[220px] rounded-[24px] border border-blue-400/20 bg-background/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.35)]">
      <Handle type="target" position={Position.Left} className="bg-blue-400!" />
      <Handle type="source" position={Position.Right} className="bg-blue-400!" />
      <div className="flex items-center gap-3">
        <div className="rounded-2xl border border-blue-400/20 bg-blue-400/10 p-2 text-blue-300">
          <ShieldCheck className="size-4" />
        </div>
        <div>
          <p className="text-xs tracking-[0.18em] text-muted uppercase">Condition</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{nodeData.title}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">{nodeData.subtitle}</p>
    </div>
  );
}
