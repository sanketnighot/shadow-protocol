import { AlertOctagon, ShieldAlert, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { useUiStore } from "@/store/useUiStore";
import { useState } from "react";
import { useToast } from "@/hooks/useToast";

export function PanicModal() {
  const isOpen = useUiStore((s) => s.isPanicModalOpen);
  const data = useUiStore((s) => s.panicRouteData);
  const close = useUiStore((s) => s.closePanicModal);
  const { success, info } = useToast();
  const [isExecuting, setIsExecuting] = useState(false);

  const handlePanicExecute = async () => {
    setIsExecuting(true);
    try {
      success("Panic Route Staged", "Review the emergency route in the agent workflow before execution.");
      close();
    } catch (err) {
      info("Emergency Exit Failed", String(err));
    } finally {
      setIsExecuting(false);
    }
  };

  if (!data) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="glass-panel border-red-500/50 bg-red-950/20 max-w-[calc(100%-1.5rem)] rounded-sm p-0 text-foreground sm:max-w-xl overflow-hidden">
        <div className="absolute inset-0 pointer-events-none border-2 border-red-500/20 animate-pulse" />
        
        <div className="bg-red-500/10 px-6 py-4 flex items-center gap-3 border-b border-red-500/20">
          <AlertOctagon className="size-6 text-red-500 animate-bounce" />
          <div>
            <h2 className="text-xl font-black tracking-tighter text-red-500 uppercase">Emergency Exit Triggered</h2>
            <p className="text-[10px] font-mono font-bold text-red-400/80 tracking-widest uppercase">Critical Protocol Risk Detected</p>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="rounded-sm border border-red-500/20 bg-black/40 p-4">
            <div className="flex items-center gap-3 text-red-200">
              <ShieldAlert className="size-5 shrink-0" />
              <p className="text-sm font-medium leading-relaxed">
                A high-confidence security event has been detected for your assets.
                Delayed action may result in total loss of funds.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-mono text-muted uppercase tracking-[0.2em]">Panic Route Preview</p>
            <div className="grid gap-2">
              {data.routes?.map((route: any, i: number) => (
                <div key={i} className="flex items-center justify-between rounded-sm border border-white/5 bg-white/5 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Zap className="size-3.5 text-amber-400" />
                    <span className="font-mono text-xs font-bold text-foreground">{route.fromToken} → {route.toToken}</span>
                  </div>
                  <span className="font-mono text-[10px] text-muted">{route.chain}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between items-center py-2 border-t border-white/5">
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest">Total Value At Risk</span>
            <span className="text-xl font-mono font-bold text-red-400">{data.totalValueAtRisk}</span>
          </div>
        </div>

        <DialogFooter className="p-6 bg-black/20 border-t border-white/5 sm:justify-between gap-4">
          <Button
            variant="ghost"
            onClick={close}
            disabled={isExecuting}
            className="text-xs text-muted hover:text-foreground rounded-sm"
          >
            I will risk it / Dismiss
          </Button>
          <Button
            onClick={handlePanicExecute}
            disabled={isExecuting}
            className="bg-red-600 hover:bg-red-500 text-white font-black tracking-widest uppercase px-8 py-6 h-auto text-base rounded-sm shadow-[0_0_30px_rgba(220,38,38,0.4)]"
          >
            {isExecuting ? "Executing Panic Route..." : "Withdraw All to Safety"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
