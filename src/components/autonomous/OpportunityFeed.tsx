import { useEffect, useState, useCallback } from "react";
import { Sparkles, RefreshCw, ExternalLink, X, TrendingUp, Shield, Zap } from "lucide-react";

import { getOpportunities, runOpportunityScan, dismissOpportunity } from "@/lib/autonomous";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/hooks/useToast";
import { logError } from "@/lib/logger";
import { cn } from "@/lib/utils";
import type { MatchedOpportunity } from "@/types/autonomous";

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  return "just now";
}

const riskColors: Record<string, string> = {
  low: "text-green-400 bg-green-500/10",
  medium: "text-yellow-400 bg-yellow-500/10",
  high: "text-orange-400 bg-orange-500/10",
  critical: "text-red-400 bg-red-500/10",
};

const opportunityIcons: Record<string, React.ReactNode> = {
  yield: <TrendingUp className="size-4" />,
  airdrop: <Sparkles className="size-4" />,
  rebalance: <Zap className="size-4" />,
  risk_mitigation: <Shield className="size-4" />,
};

export function OpportunityFeed() {
  const [opportunities, setOpportunities] = useState<MatchedOpportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const { success, warning } = useToast();

  const fetchData = useCallback(async () => {
    try {
      const result = await getOpportunities(10);
      setOpportunities(result);
    } catch (err) {
      logError("Failed to fetch opportunities", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleScan = async () => {
    setIsScanning(true);
    try {
      await runOpportunityScan();
      await fetchData();
      success("Scan completed", "New opportunities have been identified.");
    } catch (err) {
      warning("Scan failed", String(err));
    } finally {
      setIsScanning(false);
    }
  };

  const handleDismiss = async (opportunityId: string) => {
    setDismissingId(opportunityId);
    try {
      await dismissOpportunity(opportunityId);
      setOpportunities((prev) => prev.filter((o) => o.opportunity.id !== opportunityId));
      success("Opportunity dismissed", "It won't appear again.");
    } catch (err) {
      warning("Failed to dismiss", String(err));
    } finally {
      setDismissingId(null);
    }
  };

  if (isLoading) {
    return (<div className="space-y-3">{[1, 2, 3].map((i) => (<Skeleton key={i} className="h-28 w-full" />))}</div>);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h3 className="text-sm font-medium text-foreground">Opportunities</h3>
        </div>
        <Button size="sm" variant="outline" className="h-8 rounded-sm border-white/10 text-xs" onClick={handleScan} disabled={isScanning}>
          <RefreshCw className={cn("mr-1.5 size-3", isScanning && "animate-spin")} />
          {isScanning ? "Scanning..." : "Scan"}
        </Button>
      </div>

      {opportunities.length === 0 ? (
        <div className="glass-panel rounded-sm p-8 text-center">
          <Sparkles className="size-8 mx-auto mb-3 text-muted" />
          <p className="text-sm text-muted">No opportunities found</p>
          <p className="text-xs text-muted/70 mt-1">Run a scan to discover personalized opportunities</p>
        </div>
      ) : (
        <div className="space-y-3">
          {opportunities.map((matched) => {
            const opp = matched.opportunity;
            return (
              <div key={opp.id} className="glass-panel rounded-sm p-4 transition-all hover:border-white/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="flex size-8 items-center justify-center rounded-sm bg-primary/10 text-primary shrink-0">
                      {opportunityIcons[opp.opportunityType] ?? <Sparkles className="size-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium text-foreground truncate">{opp.title}</h4>
                        <span className={cn("rounded-sm px-1.5 py-0.5 text-[10px] font-medium", riskColors[opp.riskLevel] ?? riskColors.medium)}>{opp.riskLevel}</span>
                      </div>
                      <p className="text-xs text-muted line-clamp-2 mt-1">{opp.description}</p>
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted/70">
                        <span className="font-mono">{opp.protocol}</span>
                        <span>•</span>
                        <span className="uppercase">{opp.chain}</span>
                        {opp.apy && (<><span>•</span><span className="text-green-400">{opp.apy.toFixed(1)}% APY</span></>)}
                      </div>
                      {matched.matchReasons.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {matched.matchReasons.slice(0, 2).map((reason, i) => (<span key={i} className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{reason}</span>))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted">Match</span>
                      <span className={cn("text-sm font-bold tabular-nums", matched.matchScore >= 0.8 ? "text-green-400" : matched.matchScore >= 0.5 ? "text-yellow-400" : "text-muted")}>{Math.round(matched.matchScore * 100)}%</span>
                    </div>
                    <div className="flex gap-1">
                      {opp.sourceUrl && (<Button size="icon" variant="ghost" className="h-7 w-7 rounded-sm text-muted hover:text-foreground" onClick={() => window.open(opp.sourceUrl, "_blank")}><ExternalLink className="size-3.5" /></Button>)}
                      <Button size="icon" variant="ghost" className="h-7 w-7 rounded-sm text-muted hover:text-red-400" onClick={() => handleDismiss(opp.id)} disabled={dismissingId === opp.id}><X className="size-3.5" /></Button>
                    </div>
                  </div>
                </div>
                {opp.deadline && (<div className="mt-3 pt-3 border-t border-white/5"><span className="text-[10px] text-amber-400">Deadline: {formatRelativeTime(opp.deadline * 1000)}</span></div>)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
