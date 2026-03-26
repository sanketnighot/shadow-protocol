import { useState } from "react";
import { Compass, RefreshCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { OpportunityCard } from "@/components/agent/OpportunityCard";
import { OpportunityDetailSheet } from "@/components/market/OpportunityDetailSheet";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/shared/Skeleton";
import { Button } from "@/components/ui/button";
import { useMarketOpportunities } from "@/hooks/useMarketOpportunities";
import { useToast } from "@/hooks/useToast";
import {
  getMarketOpportunityDetail,
  hasTauriRuntime,
  launchPreparedMarketAction,
  marketCategoryLabel,
  marketChainLabel,
  prepareMarketOpportunityAction,
} from "@/lib/market";
import { cn } from "@/lib/utils";
import { useWalletStore } from "@/store/useWalletStore";
import type {
  MarketOpportunity,
  MarketOpportunityDetail,
} from "@/types/market";

export function MarketView() {
  const navigate = useNavigate();
  const addresses = useWalletStore((state) => state.addresses);
  const activeAddress = useWalletStore((state) => state.activeAddress);
  const { info, warning } = useToast();
  const [category, setCategory] = useState("all");
  const [chain, setChain] = useState("all");
  const [detail, setDetail] = useState<MarketOpportunityDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);

  const walletAddresses =
    addresses.length > 0 ? addresses : activeAddress ? [activeAddress] : [];

  const {
    items,
    response,
    isLoading,
    isRefreshing,
    refresh,
    error,
    hasWalletContext,
  } = useMarketOpportunities({
    category,
    chain,
    includeResearch: true,
    walletAddresses,
    limit: 18,
  });

  const handleDetail = async (opportunity: MarketOpportunity) => {
    setDetailOpen(true);
    setDetailLoadingId(opportunity.id);
    try {
      if (!hasTauriRuntime()) {
        setDetail({
          opportunity,
          sources: [],
          rankingBreakdown: {
            globalScore: 0,
            personalScore: 0,
            totalScore: 0,
            reasons: [],
          },
          guardrailNotes: [],
          executionReadinessNotes: [],
        });
        return;
      }
      const result = await getMarketOpportunityDetail(opportunity.id);
      setDetail(result);
    } catch (detailError) {
      warning(
        "Detail unavailable",
        detailError instanceof Error ? detailError.message : String(detailError),
      );
    } finally {
      setDetailLoadingId(null);
    }
  };

  const handlePrimaryAction = async (opportunity: MarketOpportunity) => {
    if (opportunity.actionability === "research_only") {
      await handleDetail(opportunity);
      return;
    }

    setActionPendingId(opportunity.id);
    try {
      const result = await prepareMarketOpportunityAction({
        opportunityId: opportunity.id,
      });
      const route = launchPreparedMarketAction(opportunity, result);

      if (route) {
        navigate(route);
        return;
      }

      if (result.kind === "detailOnly") {
        info("Review detail", result.reason);
        await handleDetail(opportunity);
      }
    } catch (actionError) {
      warning(
        "Unable to prepare action",
        actionError instanceof Error ? actionError.message : String(actionError),
      );
    } finally {
      setActionPendingId(null);
    }
  };

  const categoryFilters = response.availableCategories;
  const chainFilters = response.availableChains;

  return (
    <>
      <div className="space-y-6">
        <section className="glass-panel rounded-sm p-5 sm:p-6">
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
              {categoryFilters.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setCategory(filter)}
                  className={cn(
                    "rounded-sm border px-3 py-1.5 text-xs font-semibold tracking-[0.18em] uppercase transition-all active:scale-95",
                    category === filter
                      ? "border-primary/30 bg-primary/12 text-primary"
                      : "border-border bg-secondary text-muted hover:bg-surface-elevated",
                  )}
                >
                  {marketCategoryLabel(filter)}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {chainFilters.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setChain(filter)}
                  className={cn(
                    "rounded-sm border px-3 py-1.5 text-xs font-semibold tracking-[0.18em] uppercase transition-all active:scale-95",
                    chain === filter
                      ? "border-primary/30 bg-surface-elevated text-foreground"
                      : "border-border bg-secondary text-muted hover:bg-surface-elevated",
                  )}
                >
                  {marketChainLabel(filter)}
                </button>
              ))}
              <Button
                type="button"
                variant="outline"
                className="rounded-sm border-border bg-secondary text-foreground hover:bg-surface-elevated"
                onClick={() => void refresh()}
                disabled={isRefreshing}
              >
                <RefreshCcw className={cn("size-4", isRefreshing && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>

          {!hasWalletContext ? (
            <div className="mt-4 rounded-sm border border-white/10 bg-secondary/40 px-3 py-2 text-sm text-muted">
              Wallet-aware ranking is limited until at least one wallet is connected and synced.
            </div>
          ) : null}

          {response.stale ? (
            <div className="mt-3 rounded-sm border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              Showing cached market opportunities while live refresh completes.
            </div>
          ) : null}
        </section>

        <div className="space-y-4">
          {isLoading ? (
            <>
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-64 w-full" />
            </>
          ) : error ? (
            <EmptyState
              icon={<Compass className="size-5" />}
              title="Market data unavailable"
              description={error}
            />
          ) : items.length > 0 ? (
            items.map((opportunity) => (
              <OpportunityCard
                key={opportunity.id}
                title={opportunity.title}
                summary={opportunity.summary}
                apy={
                  opportunity.metrics.find((metric) => metric.kind === "apy")?.value ??
                  opportunity.metrics[0]?.value ??
                  "N/A"
                }
                tvl={
                  opportunity.metrics.find((metric) => metric.kind === "tvl_usd")?.value ??
                  opportunity.metrics[1]?.value ??
                  "N/A"
                }
                risk={opportunity.risk}
                actionLabel={opportunity.primaryAction.label}
                categoryLabel={opportunity.category}
                chainLabel={opportunity.chain}
                confidence={opportunity.confidence}
                freshnessLabel={
                  opportunity.freshUntil
                    ? `Refresh ${new Date(opportunity.freshUntil * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : null
                }
                stale={opportunity.stale}
                actionability={opportunity.actionability}
                metrics={opportunity.metrics}
                onPrimaryAction={() => void handlePrimaryAction(opportunity)}
                onDetailAction={() => void handleDetail(opportunity)}
                primaryDisabled={
                  actionPendingId === opportunity.id ||
                  !opportunity.primaryAction.enabled
                }
                detailLabel={detailLoadingId === opportunity.id ? "Loading" : "Details"}
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

      <OpportunityDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        detail={detail}
      />
    </>
  );
}
