import { ArrowRight, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useUiStore } from "@/store/useUiStore";

type OpportunityCardProps = {
  title: string;
  apy: string;
  tvl: string;
  risk: string;
  actionLabel: string;
};

export function OpportunityCard({
  title,
  apy,
  tvl,
  risk,
  actionLabel,
}: OpportunityCardProps) {
  const setPendingApproval = useUiStore((state) => state.setPendingApproval);

  return (
    <div className="rounded-[24px] border border-primary/15 bg-primary/8 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <p className="mt-2 text-sm text-muted">Best current match for your moderate-risk yield mandate.</p>
        </div>
        <ShieldCheck className="size-5 text-primary" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs tracking-[0.18em] text-muted uppercase">APY</p>
          <p className="mt-1 font-semibold text-foreground">{apy}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs tracking-[0.18em] text-muted uppercase">TVL</p>
          <p className="mt-1 font-semibold text-foreground">{tvl}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs tracking-[0.18em] text-muted uppercase">Risk</p>
          <p className="mt-1 font-semibold text-foreground">{risk}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button className="rounded-full px-5" onClick={() => setPendingApproval("approval-1")}>
          {actionLabel}
        </Button>
        <Button
          variant="outline"
          className="rounded-full border-white/10 bg-white/5 text-foreground hover:bg-white/10"
        >
          Details
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
