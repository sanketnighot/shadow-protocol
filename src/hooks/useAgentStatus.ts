import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export type AgentStatus = {
  runningStrategyCount: number;
  lastActivityTimestamp: number | null;
  healthStatus: "healthy" | "degraded" | "error";
};

type TauriActiveStrategy = {
  id: string;
  name: string;
  status: string;
  last_run_at: number | null;
  last_execution_status: string | null;
  failure_count: number;
};

function formatTimeSince(timestamp: number | null): string {
  if (!timestamp) return "No activity yet";
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

export function useAgentStatus() {
  const query = useQuery({
    queryKey: ["agent", "status"],
    queryFn: async (): Promise<AgentStatus> => {
      try {
        const strategies = await invoke<TauriActiveStrategy[]>("get_strategies");
        const runningStrategies = strategies.filter(
          (s) => s.status === "active" || s.status === "paused",
        );
        const lastRun = strategies.reduce<number | null>((max, s) => {
          if (s.last_run_at && s.last_run_at > (max ?? 0)) {
            return s.last_run_at;
          }
          return max;
        }, null);

        const hasFailures = strategies.some((s) => s.failure_count > 3);
        const healthStatus: AgentStatus["healthStatus"] = hasFailures
          ? "degraded"
          : "healthy";

        return {
          runningStrategyCount: runningStrategies.length,
          lastActivityTimestamp: lastRun,
          healthStatus,
        };
      } catch {
        return {
          runningStrategyCount: 0,
          lastActivityTimestamp: null,
          healthStatus: "error",
        };
      }
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  return {
    ...query,
    runningCount: query.data?.runningStrategyCount ?? 0,
    lastActivityLabel: formatTimeSince(query.data?.lastActivityTimestamp ?? null),
    healthStatus: query.data?.healthStatus ?? "healthy",
  };
}
