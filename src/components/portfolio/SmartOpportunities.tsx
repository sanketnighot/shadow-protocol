import { Lightbulb, ArrowRight, Zap, TrendingUp, Gift } from "lucide-react";

export function SmartOpportunities() {
  const opportunities = [
    {
      id: "1",
      title: "Consolidate Dust",
      description: "Swap 4 low-value tokens to ETH to save gas on future transactions.",
      action: "Review Swap",
      icon: <Zap className="size-5 text-amber-400" />,
    },
    {
      id: "2",
      title: "High Yield Available",
      description: "Bridge USDC to Base for 5.2% APY on Aave.",
      action: "Bridge now",
      icon: <TrendingUp className="size-5 text-emerald-400" />,
    },
    {
      id: "3",
      title: "Airdrop Claim",
      description: "You have an unclaimed $ARB airdrop on Wallet 2.",
      action: "Claim",
      icon: <Gift className="size-5 text-primary" />,
    },
  ];

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <Lightbulb className="size-4 text-amber-400" />
        <h2 className="text-sm font-semibold tracking-wide text-foreground">
          Smart Opportunities
        </h2>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
        {opportunities.map((opp) => (
          <div
            key={opp.id}
            className="flex w-[280px] shrink-0 flex-col justify-between rounded-2xl border border-white/10 bg-linear-to-br from-white/[0.03] to-transparent p-4 transition-all hover:bg-white/[0.05]"
          >
            <div>
              <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-white/5">
                {opp.icon}
              </div>
              <h3 className="font-medium text-foreground">{opp.title}</h3>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                {opp.description}
              </p>
            </div>
            <button className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:text-primary/80">
              {opp.action} <ArrowRight className="size-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
