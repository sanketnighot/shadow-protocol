import { useMemo, useState } from "react";
import { Compass } from "lucide-react";

import { OpportunityCard } from "@/components/agent/OpportunityCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/shared/Skeleton";
import { MARKET_OPPORTUNITIES } from "@/data/mock";
import { useSimulatedLoading } from "@/hooks/useSimulatedLoading";
import { cn } from "@/lib/utils";

const CATEGORY_FILTERS = [
  { label: "All", value: "all" },
  { label: "Yield", value: "yield" },
  { label: "Arbitrage", value: "arbitrage" },
  { label: "Rebalance", value: "rebalance" },
] as const;

const CHAIN_FILTERS = ["All", "Arbitrum", "Base", "Multi-chain"] as const;

export function MarketView() {
  const isLoading = useSimulatedLoading();
  const [category, setCategory] = useState<(typeof CATEGORY_FILTERS)[number]["value"]>("all");
  const [chain, setChain] = useState<(typeof CHAIN_FILTERS)[number]>("All");

  const filteredOpportunities = useMemo(
    () =>
      MARKET_OPPORTUNITIES.filter((opportunity) => {
        const categoryMatches =
          category === "all" || opportunity.category === category;
        const chainMatches = chain === "All" || opportunity.chain === chain;

        return categoryMatches && chainMatches;
      }),
    [category, chain],
  );

  return (
    <div className="space-y-6">
      <section className="glass-panel rounded-[24px] p-5 sm:p-6">
        <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
          Market
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-foreground">
          Live opportunities across yield, arbitrage, and rebalancing.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-muted">
          Review the best ideas surfaced by SHADOW before you route capital or queue a strategy.
        </p>

        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {CATEGORY_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setCategory(filter.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold tracking-[0.18em] uppercase transition-all active:scale-95",
                  category === filter.value
                    ? "border-primary/30 bg-primary/12 text-primary"
                    : "border-border bg-secondary text-muted hover:bg-surface-elevated",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {CHAIN_FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setChain(filter)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold tracking-[0.18em] uppercase transition-all active:scale-95",
                  chain === filter
                    ? "border-primary/30 bg-surface-elevated text-foreground"
                    : "border-border bg-secondary text-muted hover:bg-surface-elevated",
                )}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="space-y-4">
        {isLoading ? (
          <>
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </>
        ) : filteredOpportunities.length > 0 ? (
          filteredOpportunities.map((opportunity) => (
            <OpportunityCard
              key={opportunity.id}
              title={opportunity.title}
              apy={opportunity.apy}
              tvl={opportunity.tvl}
              risk={opportunity.risk}
              actionLabel={opportunity.actionLabel}
            />
          ))
        ) : (
          <EmptyState
            icon={<Compass className="size-5" />}
            title="No opportunities match the current filters"
            description="Try broadening the category or chain filters to restore the market shortlist."
          />
        )}
      </div>
    </div>
  );
}
