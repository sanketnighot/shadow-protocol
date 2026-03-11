import { Clock3 } from "lucide-react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

type StrategyNodeData = {
  title: string;
  subtitle: string;
};

export function TriggerNode({ data }: NodeProps) {
  const nodeData = data as StrategyNodeData;

  return (
    <div className="min-w-[220px] rounded-[24px] border border-primary/20 bg-background/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.35)]">
      <Handle type="source" position={Position.Right} className="bg-primary!" />
      <div className="flex items-center gap-3">
        <div className="rounded-2xl border border-primary/20 bg-primary/10 p-2 text-primary">
          <Clock3 className="size-4" />
        </div>
        <div>
          <p className="text-xs tracking-[0.18em] text-muted uppercase">
            Trigger
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
