import { useState } from "react";
import {
  ArrowRight,
  Gift,
  Lightbulb,
  RefreshCcw,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { OpportunityDetailSheet } from "@/components/market/OpportunityDetailSheet";
import { Button } from "@/components/ui/button";
import { useMarketOpportunities } from "@/hooks/useMarketOpportunities";
import { useToast } from "@/hooks/useToast";
import {
  getMarketOpportunityDetail,
  hasTauriRuntime,
  launchPreparedMarketAction,
  marketActionabilityLabel,
  marketCategoryLabel,
  marketChainLabel,
  prepareMarketOpportunityAction,
} from "@/lib/market";
import { cn } from "@/lib/utils";
import { useWalletStore } from "@/store/useWalletStore";
import type { MarketOpportunity, MarketOpportunityDetail } from "@/types/market";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  yield: <TrendingUp className="size-4 text-emerald-400" />,
  rebalance: <Zap className="size-4 text-amber-400" />,
  catalyst: <Gift className="size-4 text-primary" />,
  spread_watch: <TrendingUp className="size-4 text-blue-400" />,
};

export function SmartOpportunities() {
  const navigate = useNavigate();
  const addresses = useWalletStore((state) => state.addresses);
  const { info, warning } = useToast();
  const [detail, setDetail] = useState<MarketOpportunityDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const { items, isLoading, isRefreshing, refresh, hasWalletContext, response } =
    useMarketOpportunities({
      category: undefined,
      chain: "all",
      includeResearch: true,
      walletAddresses: addresses,
      limit: 3,
    });

  const opportunities = items
    .filter(
      (item) =>
        item.primaryAction.enabled &&
        (item.actionability === "approval_ready" ||
          item.actionability === "agent_ready"),
    )
    .slice(0, 3);

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
    } catch (error) {
      warning(
        "Detail unavailable",
        error instanceof Error ? error.message : String(error),
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
    } catch (error) {
      warning(
        "Unable to prepare action",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setActionPendingId(null);
    }
  };

  return (
    <>
      <section className="rounded-sm border border-border bg-surface-elevated/60 p-4">
        <div className="flex flex-col gap-3 border-b border-border/70 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 rounded-sm border border-amber-500/15 bg-amber-500/10 p-1.5">
              <Lightbulb className="size-3.5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-wide text-foreground">
                Best Strategies
              </h2>
              <p className="mt-1 text-xs text-muted">
                Live actionable strategies ranked for your portfolio and guardrails.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {response.stale ? (
              <span className="rounded-sm border border-amber-500/20 bg-amber-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-amber-300">
                Cached
              </span>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-sm border-border bg-secondary px-2.5 font-mono text-[10px] uppercase tracking-wider"
              onClick={() => void refresh()}
              disabled={isRefreshing}
            >
              <RefreshCcw className={cn("mr-1.5 size-3", isRefreshing && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {!hasWalletContext ? (
          <div className="mt-3 flex items-start gap-3 rounded-sm border border-border bg-secondary/50 p-3">
            <div className="rounded-sm bg-secondary p-2">
              <Wallet className="size-4 text-muted" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Connect a wallet</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Strategy ranking appears after at least one synced wallet is available.
              </p>
            </div>
          </div>
        ) : isLoading && opportunities.length === 0 ? (
          <div className="mt-3 space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`opportunity-skeleton-${index}`}
                className="h-24 animate-pulse rounded-sm border border-border bg-secondary/50"
              />
            ))}
          </div>
        ) : opportunities.length > 0 ? (
          <div className="mt-3 divide-y divide-border rounded-sm border border-border bg-background/20">
            {opportunities.map((opportunity) => (
              <OpportunityRow
                key={opportunity.id}
                opportunity={opportunity}
                onPrimaryAction={() => void handlePrimaryAction(opportunity)}
                onDetailAction={() => void handleDetail(opportunity)}
                primaryDisabled={
                  actionPendingId === opportunity.id ||
                  !opportunity.primaryAction.enabled
                }
                detailLabel={
                  detailLoadingId === opportunity.id ? "Loading" : "Details"
                }
              />
            ))}
          </div>
        ) : (
          <div className="mt-3 flex items-start gap-3 rounded-sm border border-border bg-secondary/50 p-3">
            <div className="rounded-sm bg-secondary p-2">
              <TrendingUp className="size-4 text-muted" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No live strategies</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                No approval-ready or agent-ready strategy is available right now.
              </p>
            </div>
          </div>
        )}
      </section>

      <OpportunityDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        detail={detail}
      />
    </>
  );
}

type OpportunityRowProps = {
  opportunity: MarketOpportunity;
  onPrimaryAction: () => void;
  onDetailAction: () => void;
  primaryDisabled: boolean;
  detailLabel: string;
};

function OpportunityRow({
  opportunity,
  onPrimaryAction,
  onDetailAction,
  primaryDisabled,
  detailLabel,
}: OpportunityRowProps) {
  const keyMetric = opportunity.metrics[0];
  const relevanceReason = opportunity.portfolioFit.relevanceReasons[0];

  return (
    <div className="grid gap-3 p-3 transition-colors hover:bg-white/1.5 lg:grid-cols-[minmax(0,1.8fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-sm border border-border bg-secondary">
            {CATEGORY_ICONS[opportunity.category] ?? (
              <TrendingUp className="size-3.5 text-muted" />
            )}
          </div>
          <h3 className="min-w-0 text-sm font-medium text-foreground">
            {opportunity.title}
          </h3>
          <span className={badgeClassForActionability(opportunity.actionability)}>
            {marketActionabilityLabel(opportunity.actionability)}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            {marketCategoryLabel(opportunity.category)}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            {marketChainLabel(opportunity.chain)}
          </span>
          {opportunity.protocol ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              {opportunity.protocol}
            </span>
          ) : null}
          <span className={badgeClassForRisk(opportunity.risk)}>{opportunity.risk} risk</span>
        </div>

        <p className="mt-1.5 line-clamp-1 text-xs leading-relaxed text-muted">
          {relevanceReason ?? opportunity.summary}
        </p>

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-muted">
          <span>{keyMetric?.label ?? "Fit"} {keyMetric?.value ?? opportunity.portfolioFit.walletCoverage}</span>
          <span>Score {Math.round(opportunity.score)}/100</span>
          <span>{Math.round(opportunity.confidence * 100)}% confidence</span>
          {opportunity.stale ? <span className="text-amber-300">cached snapshot</span> : null}
        </div>
      </div>

      <div className="flex items-center gap-2 lg:justify-end">
        <Button
          type="button"
          size="sm"
          className="h-8 rounded-sm px-3 text-xs"
          onClick={onPrimaryAction}
          disabled={primaryDisabled}
        >
          {opportunity.primaryAction.label}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-sm border-border bg-secondary px-3 text-xs"
          onClick={onDetailAction}
        >
          {detailLabel}
          <ArrowRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function badgeClassForActionability(actionability: MarketOpportunity["actionability"]) {
  switch (actionability) {
    case "approval_ready":
      return "rounded-sm border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-300";
    case "agent_ready":
      return "rounded-sm border border-primary/20 bg-primary/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-primary";
    default:
      return "rounded-sm border border-amber-500/20 bg-amber-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-amber-300";
  }
}

function badgeClassForRisk(risk: MarketOpportunity["risk"]) {
  switch (risk) {
    case "low":
      return "rounded-sm border border-emerald-500/20 bg-emerald-500/8 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-300";
    case "medium":
      return "rounded-sm border border-amber-500/20 bg-amber-500/8 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-amber-300";
    default:
      return "rounded-sm border border-red-500/20 bg-red-500/8 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-red-300";
  }
}
