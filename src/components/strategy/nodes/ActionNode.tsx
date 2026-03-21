import { ArrowRightLeft } from "lucide-react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

type StrategyNodeData = {
  title: string;
  subtitle: string;
};

export function ActionNode({ data }: NodeProps) {
  const nodeData = data as StrategyNodeData;

  return (
    <div className="min-w-[220px] rounded-sm border border-emerald-400/20 bg-background/95 p-4 shadow-none border border-white/5">
      <Handle
        type="target"
        position={Position.Left}
        className="bg-emerald-400!"
      />
      <div className="flex items-center gap-3">
        <div className="rounded-sm border border-emerald-400/20 bg-emerald-400/10 p-2 text-emerald-300">
          <ArrowRightLeft className="size-4" />
        </div>
        <div>
          <p className="text-xs tracking-[0.18em] text-muted uppercase">
            Action
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {nodeData.title}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">{nodeData.subtitle}</p>
    </div>
  );
}
