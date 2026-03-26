import { ArrowRight, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { marketActionabilityLabel, marketCategoryLabel, marketChainLabel } from "@/lib/market";
import { useUiStore } from "@/store/useUiStore";
import type { MarketOpportunityMetric } from "@/types/market";

type OpportunityCardProps = {
  title: string;
  summary?: string;
  apy: string;
  tvl: string;
  risk: string;
  actionLabel: string;
  approvalId?: string;
  strategyId?: string;
  categoryLabel?: string;
  chainLabel?: string;
  confidence?: number | null;
  freshnessLabel?: string | null;
  stale?: boolean;
  actionability?: string | null;
  metrics?: MarketOpportunityMetric[];
  onPrimaryAction?: () => void;
  onDetailAction?: () => void;
  primaryDisabled?: boolean;
  detailLabel?: string;
};

export function OpportunityCard({
  title,
  summary,
  apy,
  tvl,
  risk,
  actionLabel,
  approvalId = "approval-1",
  strategyId = "weekly-dca",
  categoryLabel,
  chainLabel,
  confidence,
  freshnessLabel,
  stale = false,
  actionability,
  metrics,
  onPrimaryAction,
  onDetailAction,
  primaryDisabled = false,
  detailLabel = "Details",
}: OpportunityCardProps) {
  const setPendingApproval = useUiStore((state) => state.setPendingApproval);
  const skippedApprovalStrategyIds = useUiStore((state) => state.skippedApprovalStrategyIds);
  const { success } = useToast();

  const handlePrimaryAction = () => {
    if (onPrimaryAction) {
      onPrimaryAction();
      return;
    }

    if (skippedApprovalStrategyIds.includes(strategyId)) {
      success("Strategy auto-approved", `${title} can execute without another prompt.`);
      return;
    }

    setPendingApproval(approvalId);
  };

  const displayMetrics =
    metrics && metrics.length > 0
      ? metrics.slice(0, 3)
      : [
          { label: "APY", value: apy, kind: "apy" },
          { label: "TVL", value: tvl, kind: "tvl" },
          { label: "Risk", value: risk, kind: "risk" },
        ];

  return (
    <div className="rounded-sm border border-border bg-surface-elevated p-5 shadow-none border border-white/5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <p className="mt-2 text-sm text-muted">
            {summary ?? "Best current match for your moderate-risk yield mandate."}
          </p>
        </div>
        <ShieldCheck className="size-5 text-primary" />
      </div>
      {(categoryLabel || chainLabel || actionability || freshnessLabel || confidence != null) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {categoryLabel ? (
            <span className="rounded-sm border border-white/10 bg-secondary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              {marketCategoryLabel(categoryLabel)}
            </span>
          ) : null}
          {chainLabel ? (
            <span className="rounded-sm border border-white/10 bg-secondary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              {marketChainLabel(chainLabel)}
            </span>
          ) : null}
          {actionability ? (
            <span className="rounded-sm border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
              {marketActionabilityLabel(actionability)}
            </span>
          ) : null}
          {confidence != null ? (
            <span className="rounded-sm border border-white/10 bg-secondary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              {Math.round(confidence * 100)}% confidence
            </span>
          ) : null}
          {freshnessLabel ? (
            <span className="rounded-sm border border-white/10 bg-secondary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              {freshnessLabel}
            </span>
          ) : null}
          {stale ? (
            <span className="rounded-sm border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">
              Cached
            </span>
          ) : null}
        </div>
      )}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {displayMetrics.map((metric) => (
          <div key={`${metric.kind}-${metric.label}`} className="rounded-sm border border-border bg-secondary p-3">
            <p className="text-xs tracking-[0.18em] text-muted uppercase">{metric.label}</p>
            <p className="mt-1 font-semibold text-foreground">{metric.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          className="rounded-sm px-5 active:scale-95"
          onClick={handlePrimaryAction}
          disabled={primaryDisabled}
        >
          {actionLabel}
        </Button>
        <Button
          variant="outline"
          className="rounded-sm border-border bg-secondary text-foreground hover:bg-surface-elevated"
          onClick={onDetailAction}
        >
          {detailLabel}
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
