import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Terminal, 
  ChevronDown, 
  ChevronUp, 
  Box,
  Activity
} from "lucide-react";
import { cn } from "@/lib/utils";

type CommandLogEntry = {
  id: string;
  toolName: string;
  payloadJson: string;
  resultMessage: string;
  status: string;
  createdAt: number;
};

function LogCard({ log }: { log: CommandLogEntry }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Format JSON for better display
  let formattedPayload = log.payloadJson;
  try {
    const parsed = JSON.parse(log.payloadJson);
    formattedPayload = JSON.stringify(parsed, null, 2);
  } catch (e) {
    // Keep as is
  }

  return (
    <div className="glass-panel group rounded-sm border border-white/5 transition-all hover:border-white/10 overflow-hidden">
      <div 
        className="p-4 flex items-start gap-4 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
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
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold text-primary uppercase tracking-[0.15em] bg-primary/10 px-2 py-0.5 rounded-full">
                {log.toolName.replace(/_/g, " ")}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                ID: {log.id.slice(0, 8)}...
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-muted whitespace-nowrap">
                {new Date(log.createdAt * 1000).toLocaleString()}
              </span>
              {isExpanded ? <ChevronUp className="size-3.5 text-muted" /> : <ChevronDown className="size-3.5 text-muted" />}
            </div>
          </div>
          
          <p className="text-sm font-medium text-foreground/95 leading-relaxed">
            {log.resultMessage}
          </p>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-white/5 bg-black/40 p-4">
          <div className="flex items-center gap-2 mb-3 text-muted-foreground">
            <Box className="size-3" />
            <span className="text-[10px] font-mono uppercase tracking-widest">Execution Payload</span>
          </div>
          <pre className="font-mono text-[11px] leading-relaxed text-blue-300/80 bg-black/30 p-3 rounded-sm overflow-x-auto max-h-[300px] custom-scrollbar">
            {formattedPayload}
          </pre>
        </div>
      )}
    </div>
  );
}

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
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Activity className="size-8 animate-pulse text-primary/40" />
        <span className="font-mono text-[10px] tracking-widest text-muted uppercase">Syncing Audit Logs...</span>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 glass-panel rounded-sm border-dashed">
        <Terminal className="size-10 text-muted/30 mb-4" />
        <h3 className="text-lg font-medium text-foreground/60 tracking-tight">No autonomous activity recorded</h3>
        <p className="text-sm text-muted max-w-xs text-center mt-1">
          When you approve agent strategies or transactions, the detailed audit trail will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-mono text-muted uppercase tracking-[0.2em]">
          Latest {logs.length} Operations
        </span>
        <button 
          onClick={() => window.location.reload()}
          className="text-[10px] font-mono text-primary hover:text-primary-hover transition-colors uppercase tracking-widest"
        >
          Refresh Feed
        </button>
      </div>
      <div className="space-y-3 pb-12">
        {logs.map((log) => (
          <LogCard key={log.id} log={log} />
        ))}
      </div>
    </div>
  );
}
