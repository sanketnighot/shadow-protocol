import { useMemo, useState, useEffect, useCallback } from "react";
import { Zap, Clock, List } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";

import { CreateStrategyButton } from "@/components/automation/CreateStrategyButton";
import { StrategyEditorModal } from "@/components/automation/StrategyEditorModal";
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

export function AutomationCenter() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"strategies" | "activity">("strategies");
  const [strategies, setStrategies] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingStrategyId, setEditingStrategyId] = useState<string | null>(null);
  const [pendingRemovalStrategyId, setPendingRemovalStrategyId] = useState<string | null>(null);
  
  const { info, success, warning } = useToast();

  const fetchStrategies = useCallback(async () => {
    try {
      const result = await invoke<any[]>("get_strategies");
      const mapped = result.map(s => ({
        id: s.id,
        name: s.name,
        summary: s.summary || "No description provided.",
        nextRun: s.nextRunAt ? new Date(s.nextRunAt * 1000).toLocaleTimeString() : "Live monitoring",
        executedCount: s.lastRunAt ? 1 : 0, // Simplified
        progress: 100,
        status: s.status === "active" ? "running" : "paused"
      }));
      setStrategies(mapped);
    } catch (err) {
      console.error("Failed to fetch strategies:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  const editingStrategy = useMemo(
    () => strategies.find((strategy) => strategy.id === editingStrategyId) ?? null,
    [editingStrategyId, strategies],
  );

  const handleTogglePause = async (strategyId: string) => {
    const strategy = strategies.find(s => s.id === strategyId);
    if (!strategy) return;

    const nextStatus = strategy.status === "running" ? "paused" : "active";
    
    try {
      await invoke("update_strategy_status", { id: strategyId, status: nextStatus });
      await fetchStrategies();
      success(
        nextStatus === "active" ? "Strategy resumed" : "Strategy paused",
        "The automation schedule was updated in the database."
      );
    } catch (err) {
      warning("Update failed", String(err));
    }
  };

  const handleRemove = async (strategyId: string) => {
    try {
      await invoke("delete_strategy", { id: strategyId });
      await fetchStrategies();
      setPendingRemovalStrategyId(null);
      info("Strategy removed", "The automation was permanently deleted.");
    } catch (err) {
      warning("Removal failed", String(err));
    }
  };

  const handleSave = (
    _strategyId: string,
    _updates: any,
  ) => {
    // Modal update logic would go here
    setEditingStrategyId(null);
    fetchStrategies();
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
            <div className="flex bg-secondary/50 rounded-sm p-1 border border-white/5 mr-4">
              <button
                onClick={() => setActiveTab("strategies")}
                className={cn(
                  "flex items-center gap-2 px-4 py-1.5 rounded-sm text-xs font-medium transition-all",
                  activeTab === "strategies" 
                    ? "bg-primary/20 text-foreground border border-white/10" 
                    : "text-muted hover:text-foreground"
                )}
              >
                <List className="size-3.5" />
                Strategies
              </button>
              <button
                onClick={() => setActiveTab("activity")}
                className={cn(
                  "flex items-center gap-2 px-4 py-1.5 rounded-sm text-xs font-medium transition-all",
                  activeTab === "activity" 
                    ? "bg-primary/20 text-foreground border border-white/10" 
                    : "text-muted hover:text-foreground"
                )}
              >
                <Clock className="size-3.5" />
                Activity
              </button>
            </div>
            {activeTab === "strategies" && <CreateStrategyButton />}
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
            <div className="grid gap-4 md:grid-cols-2">
              {strategies.map((strategy) => (
                <StrategyCard
                  key={strategy.id}
                  strategy={strategy}
                  onEdit={setEditingStrategyId}
                  onRemove={setPendingRemovalStrategyId}
                  onTogglePause={handleTogglePause}
                />
              ))}
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

      <StrategyEditorModal
        open={editingStrategy !== null}
        strategy={editingStrategy}
        onClose={() => setEditingStrategyId(null)}
        onSave={handleSave}
      />
      
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
              This removes the strategy from the active automation list. You can recreate it later from the builder.
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
                handleRemove(pendingRemovalStrategyId);
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
