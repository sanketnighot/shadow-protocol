import { Pause, Play, Settings2, Trash2 } from "lucide-react";

import type { ActiveStrategy } from "@/data/mock";
import { Button } from "@/components/ui/button";

type StrategyCardProps = {
  strategy: ActiveStrategy;
  onEdit: (strategyId: string) => void;
  onRemove: (strategyId: string) => void;
  onTogglePause: (strategyId: string) => void;
};

export function StrategyCard({
  strategy,
  onEdit,
  onRemove,
  onTogglePause,
}: StrategyCardProps) {
  const isPaused = strategy.status === "paused";

  return (
    <article className="glass-panel rounded-sm p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{strategy.name}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{strategy.summary}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-sm text-foreground hover:bg-surface-elevated active:scale-95"
            onClick={() => onTogglePause(strategy.id)}
          >
            {isPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-sm text-foreground hover:bg-surface-elevated active:scale-95"
            onClick={() => onEdit(strategy.id)}
          >
            <Settings2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-sm text-foreground hover:bg-surface-elevated active:scale-95"
            onClick={() => onRemove(strategy.id)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-sm border border-border bg-secondary p-4">
          <p className="text-xs tracking-[0.18em] text-muted uppercase">Next run</p>
          <p className="mt-2 font-semibold text-foreground">{strategy.nextRun}</p>
        </div>
        <div className="rounded-sm border border-border bg-secondary p-4">
          <p className="text-xs tracking-[0.18em] text-muted uppercase">Executed / Status</p>
          <p className="mt-2 font-semibold text-foreground">
            {strategy.executedCount} times · {strategy.status}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted">Run health</span>
          <span className="font-semibold text-foreground">{strategy.progress}%</span>
        </div>
        <div className="h-2 rounded-sm bg-secondary">
          <div
            className="h-full rounded-sm bg-primary"
            style={{ width: `${strategy.progress}%` }}
          />
        </div>
      </div>
    </article>
  );
}
