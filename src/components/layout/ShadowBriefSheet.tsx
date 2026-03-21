import { Bot, ChevronRight, Sparkles, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { useUiStore } from "@/store/useUiStore";

type ShadowBrief = {
  headline: string;
  summary: string;
  opportunityPayload?: any;
};

export function ShadowBriefSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [brief, setBrief] = useState<ShadowBrief | null>(null);
  const openSignalApproval = useUiStore((s) => s.openSignalApproval);

  useEffect(() => {
    const unsub = listen<ShadowBrief>("shadow_brief", (event) => {
      setBrief(event.payload);
    });
    return () => {
      unsub.then(fn => fn());
    };
  }, []);

  // Mock brief for demo if none received yet
  const displayBrief = brief || {
    headline: "Daily Market Synthesis",
    summary: "Over the last 12 hours, Arbitrum TVL grew by 4%, and GMX yields spiked. I have prepared a route to shift 10% of your idle ETH to GMX.",
    opportunityPayload: {
      action: "Swap ETH to GMX",
      amount: "0.5 ETH",
      chain: "Arbitrum",
      reason: "GMX yield spike (+12% APY)"
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-primary/20 bg-black/90 max-w-[calc(100%-1.5rem)] rounded-sm p-0 text-foreground sm:max-w-lg overflow-hidden">
        <div className="bg-primary/10 px-6 py-5 flex items-center gap-3 border-b border-white/5">
          <div className="size-10 flex items-center justify-center rounded-sm bg-primary/20 text-primary border border-primary/30">
            <Bot className="size-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground uppercase">Shadow Brief</h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-primary tracking-widest uppercase">Intelligence Synthesis</span>
              <span className="size-1 rounded-full bg-primary animate-pulse" />
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="size-4 text-emerald-400" />
              {displayBrief.headline}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {displayBrief.summary}
            </p>
          </div>

          {displayBrief.opportunityPayload && (
            <div className="rounded-sm border border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="size-3.5" />
                <span className="text-[10px] font-black uppercase tracking-widest">Actionable Insight</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-mono text-foreground font-bold">
                  {displayBrief.opportunityPayload.action}
                </span>
                <span className="text-xs font-mono text-muted">
                  {displayBrief.opportunityPayload.chain}
                </span>
              </div>
              <Button 
                onClick={() => {
                  openSignalApproval("execute_token_swap", displayBrief.opportunityPayload);
                  onOpenChange(false);
                }}
                className="w-full bg-primary hover:bg-primary/90 text-white rounded-sm h-10 text-xs font-bold uppercase tracking-widest"
              >
                Execute Path
                <ChevronRight className="size-4 ml-1" />
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 bg-white/5 border-t border-white/5 flex sm:justify-center">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted hover:text-foreground">
            Dismiss Brief
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
