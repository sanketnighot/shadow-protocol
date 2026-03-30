import { useEffect, useState, useCallback } from "react";
import { Play, Square, Cpu, Clock, ListChecks, Activity, RefreshCw, AlertTriangle, Zap } from "lucide-react";

import { getOrchestratorState, startOrchestrator, stopOrchestrator, getTaskStats } from "@/lib/autonomous";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/hooks/useToast";
import { logError } from "@/lib/logger";
import { cn } from "@/lib/utils";

function formatRelativeTime(timestamp?: number): string {
  if (!timestamp || timestamp === 0) return "Never";
  const now = Date.now();
  const diff = now - timestamp * 1000;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

interface OrchestratorDisplayState {
  isRunning: boolean;
  lastCheck?: number;
  nextCheck?: number;
  tasksGenerated: number;
  opportunitiesFound: number;
  healthChecksRun: number;
  errors: string[];
  pendingTasks: number;
}

export function OrchestratorControl() {
  const [state, setState] = useState<OrchestratorDisplayState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const { success, warning } = useToast();

  const fetchState = useCallback(async () => {
    try {
      const [orchState, taskStats] = await Promise.all([
        getOrchestratorState(),
        getTaskStats(),
      ]);
      setState({
        isRunning: orchState.isRunning,
        lastCheck: orchState.lastHealthCheck,
        nextCheck: orchState.lastHealthCheck ? orchState.lastHealthCheck! + 300 : undefined,
        tasksGenerated: orchState.pendingTasksCount,
        opportunitiesFound: 0,
        healthChecksRun: 0,
        errors: [],
        pendingTasks: taskStats.pending,
      });
    } catch (err) {
      logError("Failed to fetch orchestrator state", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchState();
    const interval = setInterval(fetchState, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [fetchState]);

  const handleToggle = async () => {
    if (!state) return;
    setIsToggling(true);
    try {
      if (state.isRunning) {
        await stopOrchestrator();
        setState({ ...state, isRunning: false });
        success("Orchestrator stopped", "Background tasks have been paused.");
      } else {
        await startOrchestrator();
        setState({ ...state, isRunning: true });
        success("Orchestrator started", "Background tasks are now running.");
      }
    } catch (err) {
      warning("Failed to toggle orchestrator", String(err));
    } finally {
      setIsToggling(false);
    }
  };

  if (isLoading) {
    return (<div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-24 w-full" /></div>);
  }

  if (!state) return null;

  const nextCheckIn = state.nextCheck && state.nextCheck > 0
    ? Math.max(0, state.nextCheck - Math.floor(Date.now() / 1000))
    : null;

  return (
    <div className="space-y-4">
      {/* Status Header */}
      <div className={cn("glass-panel rounded-sm p-4", state.isRunning && "border-green-500/30")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex size-10 items-center justify-center rounded-sm",
              state.isRunning ? "bg-green-500/20 text-green-400" : "bg-white/5 text-muted"
            )}>
              <Cpu className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-foreground">Orchestrator</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={cn(
                  "size-2 rounded-full",
                  state.isRunning ? "bg-green-400 animate-pulse" : "bg-zinc-500"
                )} />
                <span className="text-xs text-muted">{state.isRunning ? "Running" : "Stopped"}</span>
              </div>
            </div>
          </div>
          <Button
            size="sm"
            variant={state.isRunning ? "destructive" : "default"}
            className="rounded-sm h-8"
            onClick={handleToggle}
            disabled={isToggling}
          >
            {state.isRunning ? (
              <><Square className="mr-1.5 size-3.5" />Stop</>
            ) : (
              <><Play className="mr-1.5 size-3.5" />Start</>
            )}
          </Button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-panel rounded-sm p-3">
          <div className="flex items-center gap-2 text-muted">
            <ListChecks className="size-3.5" />
            <span className="text-[10px] uppercase tracking-wider">Pending Tasks</span>
          </div>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
            {state.pendingTasks}
          </p>
        </div>
        <div className="glass-panel rounded-sm p-3">
          <div className="flex items-center gap-2 text-muted">
            <Zap className="size-3.5" />
            <span className="text-[10px] uppercase tracking-wider">Tasks Generated</span>
          </div>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
            {state.tasksGenerated}
          </p>
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="glass-panel rounded-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            <h4 className="text-xs font-medium text-muted uppercase tracking-wider">Activity</h4>
          </div>
          {state.isRunning && nextCheckIn !== null && (
            <span className="text-[10px] text-muted/70">
              Next check in {nextCheckIn}s
            </span>
          )}
        </div>
        <div className="space-y-2">
          <ActivityRow
            label="Health Check"
            timestamp={state.lastCheck}
            icon={<Activity className="size-3" />}
            isRunning={state.isRunning}
          />
          <ActivityRow
            label="Opportunity Scan"
            timestamp={state.lastCheck}
            icon={<RefreshCw className="size-3" />}
            isRunning={state.isRunning}
          />
          <ActivityRow
            label="Task Generation"
            timestamp={state.lastCheck}
            icon={<ListChecks className="size-3" />}
            isRunning={state.isRunning}
          />
        </div>
      </div>

      {/* Errors */}
      {state.errors.length > 0 && (
        <div className="glass-panel rounded-sm p-4 border-red-500/30">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="size-4 text-red-400" />
            <h4 className="text-xs font-medium text-red-400 uppercase tracking-wider">Errors</h4>
          </div>
          <div className="space-y-1">
            {state.errors.slice(0, 3).map((err, i) => (
              <p key={i} className="text-xs text-red-300">{err}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityRow({
  label,
  timestamp,
  icon,
  isRunning
}: {
  label: string;
  timestamp?: number;
  icon: React.ReactNode;
  isRunning?: boolean;
}) {
  const hasRun = timestamp && timestamp > 0;

  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2 text-muted">
        <span className={cn(
          "flex items-center justify-center size-5 rounded-sm",
          hasRun ? "bg-green-500/10 text-green-400" : "bg-white/5"
        )}>
          {icon}
        </span>
        <span className="text-xs">{label}</span>
      </div>
      <span className={cn(
        "text-xs",
        hasRun ? "text-muted/70" : "text-muted/40"
      )}>
        {hasRun ? formatRelativeTime(timestamp) : (isRunning ? "Pending" : "—")}
      </span>
    </div>
  );
}
