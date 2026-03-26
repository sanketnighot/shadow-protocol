import { useCallback, useEffect, useState } from "react";
import { Zap, Clock, List, Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";

import { CreateStrategyButton } from "@/components/automation/CreateStrategyButton";
import { StrategyCard } from "@/components/automation/StrategyCard";
import { ActivityLog } from "@/components/automation/ActivityLog";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/shared/Skeleton";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/useToast";
import { logError } from "@/lib/logger";
import { getStrategyExecutionHistory } from "@/lib/strategy";
import type { ActiveStrategy, StrategyExecutionRecord } from "@/types/strategy";

export function AutomationCenter() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"strategies" | "activity">("strategies");
  const [strategies, setStrategies] = useState<ActiveStrategy[]>([]);
  const [runs, setRuns] = useState<StrategyExecutionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingRemovalStrategyId, setPendingRemovalStrategyId] = useState<string | null>(null);

  const { info, success, warning } = useToast();

  const fetchStrategies = useCallback(async () => {
    if (typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window)) {
      setStrategies([]);
      setIsLoading(false);
      return;
    }
    try {
      const result = await invoke<ActiveStrategy[]>("get_strategies");
      setStrategies(result);
    } catch (err) {
      logError("Failed to fetch strategies", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchRuns = useCallback(async () => {
    if (typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window)) {
      setRuns([]);
      return;
    }
    try {
      const items = await getStrategyExecutionHistory(undefined);
      setRuns(items.slice(0, 25));
    } catch (err) {
      logError("Failed to fetch strategy execution history", err);
    }
  }, []);

  useEffect(() => {
    void fetchStrategies();
  }, [fetchStrategies]);

  useEffect(() => {
    if (activeTab === "strategies") {
      void fetchRuns();
    }
  }, [activeTab, fetchRuns]);

  const handleTogglePause = async (strategyId: string) => {
    const strategy = strategies.find((s) => s.id === strategyId);
    if (!strategy) return;

    const nextStatus = strategy.status === "active" ? "paused" : "active";

    try {
      await invoke("update_strategy_status", {
        input: { id: strategyId, status: nextStatus },
      });
      await fetchStrategies();
      success(
        nextStatus === "active" ? "Strategy resumed" : "Strategy paused",
        "Schedule updated in the local database.",
      );
    } catch (err) {
      warning("Update failed", String(err));
    }
  };

  const handleRemove = async (strategyId: string) => {
    try {
      await invoke("delete_strategy", { input: { id: strategyId } });
      await fetchStrategies();
      setPendingRemovalStrategyId(null);
      info("Strategy removed", "Automation was permanently deleted.");
    } catch (err) {
      warning("Removal failed", String(err));
    }
  };

  return (
    <div className="space-y-6">
      <section className="glass-panel rounded-sm p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
              Automation Center
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-foreground">
              {activeTab === "strategies" ? "Active strategies." : "Command history."}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="mr-4 flex rounded-sm border border-white/5 bg-secondary/50 p-1">
              <button
                type="button"
                onClick={() => setActiveTab("strategies")}
                className={cn(
                  "flex items-center gap-2 rounded-sm px-4 py-1.5 text-xs font-medium transition-all",
                  activeTab === "strategies"
                    ? "border border-white/10 bg-primary/20 text-foreground"
                    : "text-muted hover:text-foreground",
                )}
              >
                <List className="size-3.5" />
                Strategies
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("activity")}
                className={cn(
                  "flex items-center gap-2 rounded-sm px-4 py-1.5 text-xs font-medium transition-all",
                  activeTab === "activity"
                    ? "border border-white/10 bg-primary/20 text-foreground"
                    : "text-muted hover:text-foreground",
                )}
              >
                <Clock className="size-3.5" />
                Activity
              </button>
            </div>
            {activeTab === "strategies" ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="rounded-sm border-white/10 text-xs"
                >
                  <Link to="/strategy" className="inline-flex items-center gap-1.5">
                    <Sparkles className="size-3.5" aria-hidden />
                    Builder
                  </Link>
                </Button>
                <CreateStrategyButton />
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {activeTab === "strategies" ? (
        <>
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-72 w-full" />
              <Skeleton className="h-72 w-full" />
            </div>
          ) : strategies.length > 0 ? (
            <div className="space-y-8">
              <div className="grid gap-4 md:grid-cols-2">
                {strategies.map((strategy) => (
                  <StrategyCard
                    key={strategy.id}
                    strategy={strategy}
                    onEdit={(id) => navigate(`/strategy?id=${encodeURIComponent(id)}`)}
                    onRemove={setPendingRemovalStrategyId}
                    onTogglePause={handleTogglePause}
                  />
                ))}
              </div>
              {runs.length > 0 ? (
                <section className="glass-panel rounded-sm p-5">
                  <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
                    Recent strategy runs
                  </p>
                  <ul className="mt-4 space-y-2 text-sm">
                    {runs.map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 py-2 last:border-0"
                      >
                        <span className="font-mono text-xs text-muted">{r.strategyId.slice(0, 8)}…</span>
                        <span className="text-foreground">{r.status}</span>
                        <span className="text-xs text-muted">
                          {new Date(r.createdAt * 1000).toLocaleString()}
                        </span>
                        {r.reason ? (
                          <span className="w-full text-xs text-muted">{r.reason}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : (
            <EmptyState
              icon={<Zap className="size-5" />}
              title="No active strategies"
              description="Launch a new automation from the builder and it will appear here with pause, edit, and review controls."
              actionLabel="Open strategy builder"
              onAction={() => navigate("/strategy")}
            />
          )}
        </>
      ) : (
        <ActivityLog />
      )}

      <Dialog
        open={pendingRemovalStrategyId !== null}
        onOpenChange={(nextOpen) => (!nextOpen ? setPendingRemovalStrategyId(null) : undefined)}
      >
        <DialogContent className="glass-panel max-w-[calc(100%-1.5rem)] rounded-sm bg-background p-5 text-foreground sm:max-w-lg sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold tracking-[-0.03em]">
              Remove strategy
            </DialogTitle>
            <DialogDescription className="text-sm text-muted">
              This removes the strategy from the active automation list. You can recreate it later
              from the builder.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-3 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="rounded-sm border-border bg-secondary text-foreground hover:bg-surface-elevated"
              onClick={() => setPendingRemovalStrategyId(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-sm px-6"
              onClick={() => {
                if (!pendingRemovalStrategyId) {
                  return;
                }
                void handleRemove(pendingRemovalStrategyId);
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
