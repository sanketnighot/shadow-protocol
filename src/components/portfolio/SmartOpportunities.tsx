import { useMemo } from "react";
import { Lightbulb, ArrowRight, TrendingUp, Zap, Gift, Wallet } from "lucide-react";

import { useMarketOpportunities } from "@/hooks/useMarketOpportunities";
import { useWalletStore } from "@/store/useWalletStore";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  yield: <TrendingUp className="size-5 text-emerald-400" />,
  rebalance: <Zap className="size-5 text-amber-400" />,
  catalyst: <Gift className="size-5 text-primary" />,
  spread_watch: <TrendingUp className="size-5 text-blue-400" />,
};

const ACTION_LABELS: Record<string, string> = {
  open_detail: "View details",
  prepare_action: "Review action",
  open_agent: "Ask agent",
};

export function SmartOpportunities() {
  const addresses = useWalletStore((state) => state.addresses);
  const { items, isLoading, hasWalletContext } = useMarketOpportunities({
    category: undefined,
    chain: "all",
    includeResearch: true,
    walletAddresses: addresses,
    limit: 3,
  });

  const opportunities = useMemo(() => {
    return items.slice(0, 3).map((opp) => ({
      id: opp.id,
      title: opp.title,
      description: opp.summary,
      action: ACTION_LABELS[opp.primaryAction.kind] ?? "View",
      icon: CATEGORY_ICONS[opp.category] ?? <TrendingUp className="size-5 text-muted" />,
      risk: opp.risk,
      score: opp.score,
    }));
  }, [items]);

  if (!hasWalletContext) {
    return (
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <Lightbulb className="size-4 text-amber-400" />
          <h2 className="text-sm font-semibold tracking-wide text-foreground">
            Smart Opportunities
          </h2>
        </div>
        <div className="flex gap-4">
          <div className="flex w-[280px] shrink-0 flex-col justify-between rounded-sm border border-border bg-surface-elevated p-4">
            <div>
              <div className="mb-3 flex size-10 items-center justify-center rounded-sm bg-secondary">
                <Wallet className="size-5 text-muted" />
              </div>
              <h3 className="font-medium text-foreground">Connect a wallet</h3>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                Add a wallet to see personalized DeFi opportunities based on your portfolio.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <Lightbulb className="size-4 text-amber-400" />
        <h2 className="text-sm font-semibold tracking-wide text-foreground">
          Smart Opportunities
        </h2>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
        {isLoading && !opportunities.length
          ? Array.from({ length: 3 }).map((_, i) => (
              <div
                key={`skeleton-${i}`}
                className="flex w-[280px] shrink-0 flex-col justify-between rounded-sm border border-border bg-surface-elevated p-4 animate-pulse"
              >
                <div>
                  <div className="mb-3 size-10 rounded-sm bg-secondary" />
                  <div className="mb-2 h-4 w-24 rounded bg-secondary" />
                  <div className="h-8 w-full rounded bg-secondary" />
                </div>
                <div className="mt-4 h-4 w-20 rounded bg-secondary" />
              </div>
            ))
          : opportunities.map((opp) => (
              <div
                key={opp.id}
                className="flex w-[280px] shrink-0 flex-col justify-between rounded-sm border border-border bg-surface-elevated p-4 transition-all hover:border-primary/30 border border-white/5"
              >
                <div>
                  <div className="mb-3 flex size-10 items-center justify-center rounded-sm bg-secondary">
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
        {hasWalletContext && !isLoading && opportunities.length === 0 && (
          <div className="flex w-[280px] shrink-0 flex-col justify-between rounded-sm border border-border bg-surface-elevated p-4">
            <div>
              <div className="mb-3 flex size-10 items-center justify-center rounded-sm bg-secondary">
                <TrendingUp className="size-5 text-muted" />
              </div>
              <h3 className="font-medium text-foreground">No opportunities found</h3>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                Markets are calm. We'll notify you when interesting opportunities arise.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
