import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShadowApp } from "@/data/apps";
import { useState } from "react";
import { Copy, ExternalLink, ShieldCheck, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

type AppSettingsPanelProps = {
  app: ShadowApp | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AppSettingsPanel({ app, open, onOpenChange }: AppSettingsPanelProps) {
  const [maxSpend, setMaxSpend] = useState("500");

  if (!app) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-background border-border text-foreground p-0 overflow-hidden rounded-sm">
        <DialogHeader className="p-6 pb-4 border-b border-border bg-secondary">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-sm border border-primary/20 bg-primary/12 text-primary">
              <ShieldCheck className="size-5" />
            </div>
            <div className="text-left">
              <p className="font-mono text-[10px] tracking-[0.24em] text-muted uppercase">Configuration</p>
              <DialogTitle className="mt-0.5 text-lg font-bold tracking-tight">{app.name} Settings</DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Wallet className="size-4 text-primary" />
              <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">Agent Wallet</p>
            </div>
            
            <div className="rounded-sm border border-border bg-secondary p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted uppercase font-mono tracking-wider">Address</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-foreground bg-surface-elevated px-2 py-1 rounded-sm border border-border">0x742d...3a9f</span>
                  <button className="text-muted hover:text-primary transition-colors active:scale-90">
                    <Copy className="size-3.5" />
                  </button>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted uppercase font-mono tracking-wider">Active Balance</span>
                <span className="text-sm font-bold text-foreground font-mono">0.05 ETH</span>
              </div>
              
              <div className="pt-2 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 rounded-sm border-border bg-surface-elevated text-[10px] font-bold uppercase tracking-wider h-8">
                  Top Up
                </Button>
                <Button variant="outline" size="sm" className="flex-1 rounded-sm border-border bg-surface-elevated text-[10px] font-bold uppercase tracking-wider h-8">
                  Explorer <ExternalLink className="size-3 ml-1.5 opacity-50" />
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">Safety Guardrails</p>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-foreground font-medium">Daily Spending Limit</span>
                <span className="text-sm font-bold text-primary font-mono bg-primary/10 px-2 py-0.5 rounded-sm border border-primary/20">${maxSpend}</span>
              </div>
              
              <div className="space-y-2">
                <input
                  type="range"
                  min="0"
                  max="5000"
                  step="50"
                  value={maxSpend}
                  onChange={(e) => setMaxSpend(e.target.value)}
                  className="h-1.5 w-full appearance-none rounded-full bg-secondary accent-primary transition-all cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-muted font-mono tracking-tighter opacity-50">
                  <span>$0</span>
                  <span>$5000</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-muted uppercase font-mono tracking-wider mb-3">Allowed Protocols</p>
              <div className="grid gap-2">
                {["Uniswap", "Aave", "Compound", "Curve"].map((proto, i) => (
                  <div key={proto} className="flex items-center justify-between rounded-sm border border-border bg-secondary p-3 transition-colors hover:bg-surface-elevated">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "size-2 rounded-full",
                        i < 2 ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-muted"
                      )} />
                      <span className="text-sm font-medium">{proto}</span>
                    </div>
                    <button className={cn(
                      "rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest transition-all",
                      i < 2 
                        ? "border-primary/20 bg-primary/12 text-primary" 
                        : "border-border bg-surface-elevated text-muted hover:text-foreground"
                    )}>
                      {i < 2 ? "Permitted" : "Allow"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-border bg-secondary">
          <Button className="w-full h-11 rounded-sm text-xs font-bold uppercase tracking-[0.18em]" onClick={() => onOpenChange(false)}>
            Commit Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
