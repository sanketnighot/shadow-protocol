import { Bot, ChevronRight, Sparkles, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/useToast";
import {
  hasTauriRuntime,
  launchPreparedMarketAction,
  marketActionabilityLabel,
  marketChainLabel,
  prepareMarketOpportunityAction,
} from "@/lib/market";
import type { MarketOpportunity } from "@/types/market";

type ShadowBrief = {
  headline: string;
  summary: string;
  opportunityId?: string | null;
  opportunity?: MarketOpportunity | null;
};

export function ShadowBriefSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [brief, setBrief] = useState<ShadowBrief | null>(null);
  const navigate = useNavigate();
  const { info, warning } = useToast();

  useEffect(() => {
    if (!hasTauriRuntime()) {
      return;
    }
    const unsub = listen<ShadowBrief>("shadow_brief", (event) => {
      setBrief(event.payload);
    });
    return () => {
      unsub.then((fn) => fn());
    };
  }, []);

  const displayBrief = brief || {
    headline: "Daily Market Synthesis",
    summary:
      "SHADOW will surface fresh opportunities here after the first market intelligence cycle completes.",
    opportunity: null,
  };

  const handleOpportunityAction = async () => {
    const opportunity = displayBrief.opportunity;
    if (!opportunity) {
      return;
    }

    try {
      const result = await prepareMarketOpportunityAction({
        opportunityId: opportunity.id,
      });
      const route = launchPreparedMarketAction(opportunity, result);
      onOpenChange(false);
      if (route) {
        navigate(route);
        return;
      }
      if (result.kind === "detailOnly") {
        info("Open Market", result.reason);
        navigate("/market");
      }
    } catch (error) {
      warning(
        "Unable to open opportunity",
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel max-w-[calc(100%-1.5rem)] overflow-hidden rounded-sm border border-primary/20 bg-black/90 p-0 text-foreground sm:max-w-lg">
        <div className="flex items-center gap-3 border-b border-white/5 bg-primary/10 px-6 py-5">
          <div className="flex size-10 items-center justify-center rounded-sm border border-primary/30 bg-primary/20 text-primary">
            <Bot className="size-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground uppercase">Shadow Brief</h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-primary tracking-widest uppercase">
                Intelligence Synthesis
              </span>
              <span className="size-1 rounded-full bg-primary animate-pulse" />
            </div>
          </div>
        </div>

        <div className="space-y-6 p-6">
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
              <TrendingUp className="size-4 text-emerald-400" />
              {displayBrief.headline}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {displayBrief.summary}
            </p>
          </div>

          {displayBrief.opportunity ? (
            <div className="space-y-3 rounded-sm border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="size-3.5" />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  Linked Opportunity
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-foreground">
                  {displayBrief.opportunity.title}
                </p>
                <p className="text-xs leading-5 text-muted">
                  {displayBrief.opportunity.summary}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.18em]">
                <span className="rounded-sm border border-white/10 bg-secondary px-2 py-1 text-muted">
                  {marketChainLabel(displayBrief.opportunity.chain)}
                </span>
                <span className="rounded-sm border border-primary/20 bg-primary/10 px-2 py-1 text-primary">
                  {marketActionabilityLabel(displayBrief.opportunity.actionability)}
                </span>
              </div>
              <Button
                onClick={() => void handleOpportunityAction()}
                className="h-10 w-full rounded-sm bg-primary text-xs font-bold uppercase tracking-widest text-white hover:bg-primary/90"
              >
                {displayBrief.opportunity.primaryAction.label}
                <ChevronRight className="ml-1 size-4" />
              </Button>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex bg-white/5 p-4 sm:justify-center">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted hover:text-foreground"
          >
            Dismiss Brief
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
