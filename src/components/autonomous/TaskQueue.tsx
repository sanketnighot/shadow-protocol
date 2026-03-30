import { useEffect, useState, useCallback } from "react";
import { Check, X, Clock, AlertTriangle, Zap, TrendingUp, Shield } from "lucide-react";
import { getPendingTasks, approveTask, rejectTask } from "@/lib/autonomous";
import { Skeleton } from "@/components/shared/Skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import { logError } from "@/lib/logger";
import type { Task, TaskPriority } from "@/types/autonomous";

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  return "just now";
}

const priorityColors: Record<TaskPriority, string> = { low: "text-muted", medium: "text-yellow-500", high: "text-orange-500", urgent: "text-red-500" };
const priorityIcons: Record<TaskPriority, React.ReactNode> = { low: <Clock className="size-3" />, medium: <AlertTriangle className="size-3" />, high: <AlertTriangle className="size-3" />, urgent: <Zap className="size-3" /> };
const categoryIcons: Record<string, React.ReactNode> = { rebalance: <TrendingUp className="size-4" />, risk_mitigation: <Shield className="size-4" /> };

export function TaskQueue() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const { success, warning } = useToast();

  const fetchTasks = useCallback(async () => { try { setTasks(await getPendingTasks()); } catch (err) { logError("Failed to fetch tasks", err); } finally { setIsLoading(false); } }, []);

  useEffect(() => { void fetchTasks(); }, [fetchTasks]);

  const handleApprove = async (taskId: string) => {
    setProcessingId(taskId);
    try { await approveTask(taskId); setTasks((prev) => prev.filter((t) => t.id !== taskId)); success("Task approved", "The action is now queued for execution."); }
    catch (err) { warning("Approval failed", String(err)); } finally { setProcessingId(null); }
  };

  const handleReject = async (taskId: string) => {
    setProcessingId(taskId);
    try { await rejectTask(taskId); setTasks((prev) => prev.filter((t) => t.id !== taskId)); success("Task rejected", "The suggestion has been dismissed."); }
    catch (err) { warning("Rejection failed", String(err)); } finally { setProcessingId(null); }
  };

  if (isLoading) return <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-32 w-full" />)}</div>;

  if (tasks.length === 0) return (
    <div className="glass-panel rounded-sm p-8 text-center">
      <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-primary/10"><Check className="size-5 text-primary" /></div>
      <p className="text-sm text-muted">All caught up. No pending tasks.</p>
      <p className="mt-1 text-xs text-muted/70">New suggestions will appear here automatically.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <div key={task.id} className="glass-panel rounded-sm p-4 transition-all hover:border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-8 items-center justify-center rounded-sm bg-primary/10 text-primary">{categoryIcons[task.category] ?? <Zap className="size-4" />}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="truncate text-sm font-medium text-foreground">{task.title}</h4>
                  <span className={cn("flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider", priorityColors[task.priority])}>{priorityIcons[task.priority]}{task.priority}</span>
                </div>
                <p className="mt-1 text-xs text-muted line-clamp-2">{task.summary}</p>
                <div className="mt-2 flex items-center gap-4 text-[11px] text-muted/70">
                  <span>Source: {task.sourceTrigger.replace(/_/g, " ")}</span><span>•</span><span>Confidence: {Math.round(task.confidenceScore * 100)}%</span>
                  {task.expiresAt ? <><span>•</span><span>Expires {formatRelativeTime(task.expiresAt * 1000)}</span></> : null}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="outline" className="h-8 rounded-sm border-white/10 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300" onClick={() => handleReject(task.id)} disabled={processingId === task.id}><X className="mr-1 size-3" />Reject</Button>
              <Button size="sm" className="h-8 rounded-sm bg-primary text-xs text-white hover:bg-primary/80" onClick={() => handleApprove(task.id)} disabled={processingId === task.id}><Check className="mr-1 size-3" />Approve</Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
