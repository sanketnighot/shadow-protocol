import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Clock, CheckCircle2, XCircle, AlertCircle, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

type CommandLogEntry = {
  id: string;
  toolName: string;
  payloadJson: string;
  resultMessage: string;
  status: string;
  createdAt: number;
};

export function ActivityLog() {
  const [logs, setLogs] = useState<CommandLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const result = await invoke<CommandLogEntry[]>("get_command_log", { limit: 50 });
        setLogs(result);
      } catch (err) {
        console.error("Failed to fetch command logs:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchLogs();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Clock className="size-6 animate-spin text-muted" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 glass-panel rounded-sm">
        <Terminal className="size-10 text-muted mb-4" />
        <h3 className="text-lg font-medium text-foreground">No recent activity</h3>
        <p className="text-sm text-muted">Approved or rejected agent actions will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {logs.map((log) => (
        <div key={log.id} className="glass-panel rounded-sm p-4 flex items-start gap-4 border border-white/5">
          <div className={cn(
            "mt-1 p-2 rounded-sm shrink-0",
            log.status === "approved" ? "bg-green-500/10 text-green-400" : 
            log.status === "rejected" ? "bg-yellow-500/10 text-yellow-400" : 
            "bg-red-500/10 text-red-400"
          )}>
            {log.status === "approved" ? <CheckCircle2 className="size-4" /> : 
             log.status === "rejected" ? <AlertCircle className="size-4" /> : 
             <XCircle className="size-4" />}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-mono text-xs font-bold text-primary uppercase tracking-wider">
                {log.toolName.replace(/_/g, " ")}
              </span>
              <span className="text-[10px] text-muted whitespace-nowrap">
                {new Date(log.createdAt * 1000).toLocaleString()}
              </span>
            </div>
            <p className="text-sm text-foreground/90 leading-relaxed mb-2">
              {log.resultMessage}
            </p>
            <div className="bg-black/20 rounded-sm p-2 overflow-hidden">
               <p className="font-mono text-[9px] text-muted truncate">
                 {log.payloadJson}
               </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
