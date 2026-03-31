import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, Clock, ListChecks, Play, Square, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  bindAutonomousListeners,
  getOrchestratorState,
  getTaskStats,
  startOrchestrator,
  stopOrchestrator,
} from "@/lib/autonomous";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { logError } from "@/lib/logger";
import { cn } from "@/lib/utils";

function formatRelativeTime(timestamp?: number): string {
  if (!timestamp || timestamp === 0) return "Never";
  const diff = Date.now() - timestamp * 1000;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

type OrchestratorDisplayState = {
  isRunning: boolean;
  lastCheck?: number;
  pendingTasks: number;
  opportunitiesFound: number;
};

export function OrchestratorStatusCard() {
  const navigate = useNavigate();
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
        lastCheck: orchState.lastCheck,
        pendingTasks: taskStats.pending,
        opportunitiesFound: orchState.opportunitiesFound,
      });
    } catch (err) {
      logError("Failed to fetch orchestrator state", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchState();

    let cleanup = () => {};
    bindAutonomousListeners({
      onTasksUpdated: () => {
        void fetchState();
      },
      onOrchestratorUpdated: () => {
        void fetchState();
      },
    })
      .then((unbind) => {
        cleanup = unbind;
      })
      .catch((error) => {
        logError("Failed to bind home orchestrator listeners", error);
      });

    const interval = setInterval(fetchState, 10_000);
    return () => {
      cleanup();
      clearInterval(interval);
    };
  }, [fetchState]);

  const handleToggle = async () => {
    if (!state) return;
    setIsToggling(true);
    try {
      if (state.isRunning) {
        await stopOrchestrator();
        setState((prev) => prev ? { ...prev, isRunning: false } : prev);
        warning("Orchestrator stopped", "Background tasks have been paused.");
      } else {
        await startOrchestrator();
        setState((prev) => prev ? { ...prev, isRunning: true } : prev);
        success("Orchestrator running", "Background monitoring is active.");
      }
    } catch (err) {
      logError("Failed to toggle orchestrator", err);
    } finally {
      setIsToggling(false);
    }
  };

  const isRunning = state?.isRunning ?? false;

  return (
    <div className="glass-panel rounded-sm p-5 sm:p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[0.28em] text-muted uppercase">
            Shadow Orchestrator
          </p>
          <div className="mt-2 flex items-center gap-2.5">
            {isLoading ? (
              <div className="h-6 w-36 rounded-sm bg-secondary animate-pulse" />
            ) : (
              <>
                <div className="relative flex items-center justify-center size-3">
                  <div
                    className={cn(
                      "size-2 rounded-full",
                      isRunning ? "bg-emerald-400" : "bg-muted",
                    )}
                  />
                  {isRunning && (
                    <motion.div
                      className="absolute inset-0 rounded-full bg-emerald-400"
                      animate={{ scale: [1, 2.2, 1], opacity: [0.6, 0, 0.6] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    />
                  )}
                </div>
                <span
                  className={cn(
                    "font-mono text-sm font-bold tracking-wider uppercase",
                    isRunning ? "text-emerald-400" : "text-muted",
                  )}
                >
                  {isRunning ? "Running" : "Stopped"}
                </span>
              </>
            )}
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          disabled={isLoading || isToggling}
          onClick={() => void handleToggle()}
          className={cn(
            "rounded-sm border font-mono text-[10px] uppercase tracking-wider h-8 px-3 shrink-0",
            isRunning
              ? "border-red-500/20 bg-red-500/8 text-red-400 hover:bg-red-500/15"
              : "border-emerald-500/20 bg-emerald-500/8 text-emerald-400 hover:bg-emerald-500/15",
          )}
        >
          {isRunning ? (
            <><Square className="size-3 mr-1.5" />Stop</>
          ) : (
            <><Play className="size-3 mr-1.5" />Start</>
          )}
        </Button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        <StatCell
          icon={<ListChecks className="size-3.5" />}
          label="Pending"
          value={isLoading ? "—" : String(state?.pendingTasks ?? 0)}
          highlight={!isLoading && (state?.pendingTasks ?? 0) > 0}
        />
        <StatCell
          icon={<Clock className="size-3.5" />}
          label="Last check"
          value={isLoading ? "—" : formatRelativeTime(state?.lastCheck)}
        />
        <StatCell
          icon={<Activity className="size-3.5" />}
          label="Opportunities"
          value={isLoading ? "—" : String(state?.opportunitiesFound ?? 0)}
        />
      </div>

      {/* Footer link */}
      <button
        type="button"
        onClick={() => navigate("/autonomous")}
        className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] text-muted/60 uppercase hover:text-primary transition-colors mt-auto"
      >
        <Zap className="size-3" />
        Manage autonomous →
      </button>
    </div>
  );
}

type StatCellProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
};

function StatCell({ icon, label, value, highlight = false }: StatCellProps) {
  return (
    <div className="rounded-sm border border-border bg-secondary p-3">
      <div className="flex items-center gap-1 text-muted mb-1.5">
        {icon}
        <p className="font-mono text-[9px] tracking-[0.2em] uppercase">{label}</p>
      </div>
      <p
        className={cn(
          "font-mono text-sm font-bold",
          highlight ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}
