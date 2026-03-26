import { ArrowRightLeft, ChevronRight, Clock3, ShieldCheck } from "lucide-react";
import { Fragment, useMemo } from "react";

import { cn } from "@/lib/utils";
import { getDraftNodeDisplayLabels, getOrderedPipelineNodes } from "@/lib/strategyPipeline";
import type { StrategyDraft, StrategyNodeType } from "@/types/strategy";

const stepAccent: Record<
  StrategyNodeType,
  { icon: typeof Clock3; border: string; iconWrap: string; label: string }
> = {
  trigger: {
    icon: Clock3,
    border: "border-primary/25",
    iconWrap: "border-primary/20 bg-primary/10 text-primary",
    label: "Trigger",
  },
  condition: {
    icon: ShieldCheck,
    border: "border-blue-400/25",
    iconWrap: "border-blue-400/20 bg-blue-400/10 text-blue-300",
    label: "Condition",
  },
  action: {
    icon: ArrowRightLeft,
    border: "border-emerald-400/25",
    iconWrap: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    label: "Action",
  },
};

type StrategyPipelineViewProps = {
  draft: StrategyDraft;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
};

export function StrategyPipelineView({
  draft,
  selectedNodeId,
  onSelectNode,
}: StrategyPipelineViewProps) {
  const ordered = useMemo(() => getOrderedPipelineNodes(draft), [draft]);

  return (
    <div
      className="subtle-grid relative h-full min-h-[min(400px,55vh)] w-full overflow-x-auto overflow-y-hidden"
      role="list"
      aria-label="Strategy pipeline"
    >
      <div className="flex min-h-[min(400px,55vh)] min-w-min items-center justify-center gap-0 px-4 py-6 sm:px-6 sm:py-8">
        {ordered.map((node, index) => {
          const accent = stepAccent[node.type];
          const Icon = accent.icon;
          const labels = getDraftNodeDisplayLabels(node.data);
          const selected = node.id === selectedNodeId;

          return (
            <Fragment key={node.id}>
              <button
                type="button"
                role="listitem"
                onClick={() => onSelectNode(node.id)}
                className={cn(
                  "min-w-[200px] max-w-[260px] shrink-0 rounded-sm border bg-background/95 p-4 text-left shadow-none transition-all duration-150",
                  "border-white/10 hover:border-white/20 hover:bg-background",
                  accent.border,
                  selected && "ring-2 ring-primary/45 ring-offset-2 ring-offset-background",
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "rounded-sm border p-2",
                      accent.iconWrap,
                    )}
                    aria-hidden
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium tracking-[0.18em] text-muted uppercase">
                      {accent.label}
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold text-foreground">
                      {labels.title}
                    </p>
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-muted">{labels.subtitle}</p>
              </button>
              {index < ordered.length - 1 ? (
                <div
                  className="flex shrink-0 items-center px-1 text-muted sm:px-2"
                  aria-hidden
                >
                  <ChevronRight className="size-5 opacity-50 sm:size-6" strokeWidth={1.5} />
                </div>
              ) : null}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
