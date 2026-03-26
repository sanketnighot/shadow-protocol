import { Pause, Play, Settings2, Trash2 } from "lucide-react";

import type { ActiveStrategy } from "@/types/strategy";
import { Button } from "@/components/ui/button";

type StrategyCardProps = {
  strategy: ActiveStrategy;
  onEdit: (strategyId: string) => void;
  onRemove: (strategyId: string) => void;
  onTogglePause: (strategyId: string) => void;
};

function formatNextRun(ts: number | null | undefined): string {
  if (ts == null) {
    return "Not scheduled";
  }
  return new Date(ts * 1000).toLocaleString();
}

export function StrategyCard({
  strategy,
  onEdit,
  onRemove,
  onTogglePause,
}: StrategyCardProps) {
  const isPaused = strategy.status === "paused";
  const valid = strategy.validationState === "valid";

  return (
    <article className="glass-panel rounded-sm p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-foreground">{strategy.name}</h2>
            <span
              className={`rounded-sm px-2 py-0.5 font-mono text-[10px] tracking-wide uppercase ${
                valid ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-200"
              }`}
            >
              {strategy.validationState}
            </span>
            <span className="rounded-sm border border-border px-2 py-0.5 font-mono text-[10px] text-muted uppercase">
              {strategy.template.replace(/_/g, " ")}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted">
            {strategy.summary?.trim() || "No description."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-sm text-foreground hover:bg-surface-elevated active:scale-95"
            onClick={() => onTogglePause(strategy.id)}
            aria-label={isPaused ? "Resume strategy" : "Pause strategy"}
          >
            {isPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-sm text-foreground hover:bg-surface-elevated active:scale-95"
            onClick={() => onEdit(strategy.id)}
            aria-label="Open strategy builder"
          >
            <Settings2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-sm text-foreground hover:bg-surface-elevated active:scale-95"
            onClick={() => onRemove(strategy.id)}
            aria-label="Remove strategy"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-sm border border-border bg-secondary p-4">
          <p className="text-xs tracking-[0.18em] text-muted uppercase">Next run</p>
          <p className="mt-2 font-semibold text-foreground">{formatNextRun(strategy.nextRunAt)}</p>
        </div>
        <div className="rounded-sm border border-border bg-secondary p-4">
          <p className="text-xs tracking-[0.18em] text-muted uppercase">Mode / status</p>
          <p className="mt-2 font-semibold text-foreground">
            {strategy.mode.replace(/_/g, " ")} · {strategy.status}
            {strategy.failureCount > 0 ? ` · failures ${strategy.failureCount}` : null}
          </p>
        </div>
      </div>

      {strategy.lastExecutionStatus ? (
        <p className="mt-3 font-mono text-[11px] text-muted">
          Last run: {strategy.lastExecutionStatus}
          {strategy.lastExecutionReason ? ` — ${strategy.lastExecutionReason}` : ""}
        </p>
      ) : null}
    </article>
  );
}
