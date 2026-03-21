import { Calendar, Play, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useToast } from "@/hooks/useToast";

type StrategyProposalCardProps = {
  proposal: {
    name: string;
    summary: string;
    trigger: any;
    action: any;
    guardrails: any;
  };
};

export function StrategyProposalCard({ proposal }: StrategyProposalCardProps) {
  const { success } = useToast();
  const [isDeploying, setIsDeploying] = useState(false);

  const handleDeploy = () => {
    setIsDeploying(true);
    // Simulate deployment to backend
    setTimeout(() => {
      setIsDeploying(false);
      success("Strategy Deployed", `${proposal.name} is now active in your Automation Center.`);
    }, 1500);
  };

  return (
    <div className="rounded-sm border border-primary/20 bg-primary/5 p-5 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-sm bg-primary/20 text-primary border border-primary/30">
            <Zap className="size-5" />
          </div>
          <div>
            <h4 className="font-bold text-foreground uppercase tracking-tight">{proposal.name}</h4>
            <p className="text-[10px] font-mono text-primary font-bold tracking-widest uppercase">Proposed Automation</p>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed italic">
        "{proposal.summary}"
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-sm border border-white/5 bg-black/20 p-3 space-y-1">
          <div className="flex items-center gap-2 text-muted">
            <Calendar className="size-3" />
            <span className="text-[9px] font-mono font-bold uppercase tracking-widest">Trigger</span>
          </div>
          <p className="text-xs font-mono font-bold text-foreground">
            {proposal.trigger.type === 'time' ? `Every ${proposal.trigger.interval}` : 'Condition Based'}
          </p>
        </div>
        <div className="rounded-sm border border-white/5 bg-black/20 p-3 space-y-1">
          <div className="flex items-center gap-2 text-muted">
            <Play className="size-3" />
            <span className="text-[9px] font-mono font-bold uppercase tracking-widest">Action</span>
          </div>
          <p className="text-xs font-mono font-bold text-foreground capitalize">
            {proposal.action.type}: {proposal.action.amount} {proposal.action.from} → {proposal.action.to}
          </p>
        </div>
      </div>

      <div className="rounded-sm border border-emerald-500/20 bg-emerald-500/5 p-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-emerald-400">
          <ShieldCheck className="size-3.5" />
          <span className="text-[10px] font-black uppercase tracking-[0.15em]">Guardrails Active</span>
        </div>
        <span className="text-[10px] font-mono text-emerald-400/70">
          Max Slippage: {proposal.guardrails.maxSlippage}%
        </span>
      </div>

      <Button
        onClick={handleDeploy}
        disabled={isDeploying}
        className="w-full h-11 bg-primary hover:bg-primary/90 text-white rounded-sm font-black tracking-[0.2em] uppercase text-xs"
      >
        {isDeploying ? "Deploying Logic..." : "Deploy Strategy"}
      </Button>
    </div>
  );
}
