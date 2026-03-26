import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MarketOpportunityDetail } from "@/types/market";
import { marketActionabilityLabel, marketCategoryLabel, marketChainLabel } from "@/lib/market";

type OpportunityDetailSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: MarketOpportunityDetail | null;
};

export function OpportunityDetailSheet({
  open,
  onOpenChange,
  detail,
}: OpportunityDetailSheetProps) {
  const opportunity = detail?.opportunity;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel max-w-[calc(100%-1.5rem)] rounded-sm border border-white/10 bg-black/90 p-0 text-foreground sm:max-w-2xl">
        <div className="border-b border-white/5 px-6 py-5">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
              {opportunity?.title ?? "Opportunity detail"}
            </DialogTitle>
          </DialogHeader>
          {opportunity ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-sm border border-white/10 bg-secondary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                {marketCategoryLabel(opportunity.category)}
              </span>
              <span className="rounded-sm border border-white/10 bg-secondary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                {marketChainLabel(opportunity.chain)}
              </span>
              <span className="rounded-sm border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                {marketActionabilityLabel(opportunity.actionability)}
              </span>
            </div>
          ) : null}
        </div>

        <div className="space-y-6 px-6 py-5">
          {opportunity ? (
            <>
              <section className="space-y-2">
                <p className="text-sm leading-6 text-muted">{opportunity.summary}</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {opportunity.metrics.map((metric) => (
                    <div key={`${metric.kind}-${metric.label}`} className="rounded-sm border border-white/10 bg-secondary/60 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-muted">{metric.label}</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{metric.value}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Why it surfaced</p>
                <div className="space-y-2">
                  {detail?.rankingBreakdown.reasons.map((reason) => (
                    <div key={reason} className="rounded-sm border border-white/10 bg-secondary/40 px-3 py-2 text-sm text-foreground/85">
                      {reason}
                    </div>
                  ))}
                </div>
              </section>

              <section className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Guardrails</p>
                  {(detail?.guardrailNotes ?? []).map((note) => (
                    <div key={note} className="rounded-sm border border-white/10 bg-secondary/40 px-3 py-2 text-sm text-foreground/85">
                      {note}
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Execution readiness</p>
                  {(detail?.executionReadinessNotes ?? []).map((note) => (
                    <div key={note} className="rounded-sm border border-white/10 bg-secondary/40 px-3 py-2 text-sm text-foreground/85">
                      {note}
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Sources</p>
                {(detail?.sources ?? []).map((source) => (
                  <div key={`${source.label}-${source.url ?? source.note ?? "source"}`} className="rounded-sm border border-white/10 bg-secondary/40 px-3 py-2 text-sm text-foreground/85">
                    <p className="font-semibold text-foreground">{source.label}</p>
                    {source.note ? <p className="mt-1 text-muted">{source.note}</p> : null}
                    {source.url ? (
                      <p className="mt-1 break-all font-mono text-[11px] text-muted">{source.url}</p>
                    ) : null}
                  </div>
                ))}
              </section>
            </>
          ) : (
            <div className="rounded-sm border border-white/10 bg-secondary/40 px-4 py-4 text-sm text-muted">
              No opportunity detail available.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
