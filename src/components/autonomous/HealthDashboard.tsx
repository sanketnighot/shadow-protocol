import { useEffect, useState, useCallback } from "react";
import { Activity, AlertTriangle, TrendingUp, PieChart, Shield, RefreshCw } from "lucide-react";

import { getLatestHealth, runHealthCheck, getHealthAlerts } from "@/lib/autonomous";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/hooks/useToast";
import { logError } from "@/lib/logger";
import { cn } from "@/lib/utils";
import type { PortfolioHealth, HealthAlert, DriftAnalysis } from "@/types/autonomous";

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

export function HealthDashboard() {
  const [health, setHealth] = useState<PortfolioHealth | null>(null);
  const [alerts, setAlerts] = useState<HealthAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const { success, warning } = useToast();

  const fetchData = useCallback(async () => {
    try {
      const [healthResult, alertsResult] = await Promise.all([getLatestHealth(), getHealthAlerts()]);
      setHealth(healthResult);
      setAlerts(alertsResult);
    } catch (err) {
      logError("Failed to fetch health data", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleRunCheck = async () => {
    setIsChecking(true);
    try {
      await runHealthCheck();
      await fetchData();
      success("Health check completed", "Your portfolio has been analyzed.");
    } catch (err) {
      warning("Health check failed", String(err));
    } finally {
      setIsChecking(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-400";
    if (score >= 60) return "text-yellow-400";
    if (score >= 40) return "text-orange-400";
    return "text-red-400";
  };

  const getScoreGradient = (score: number) => {
    if (score >= 80) return "from-green-500/20 to-green-500/5";
    if (score >= 60) return "from-yellow-500/20 to-yellow-500/5";
    if (score >= 40) return "from-orange-500/20 to-orange-500/5";
    return "from-red-500/20 to-red-500/5";
  };

  const parseDrift = (driftJson: string): DriftAnalysis[] => {
    try {
      return JSON.parse(driftJson) as DriftAnalysis[];
    } catch {
      return [];
    }
  };

  if (isLoading) {
    return (<div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-48 w-full" /><Skeleton className="h-32 w-full" /></div>);
  }

  const driftItems = health ? parseDrift(health.driftJson) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          <h3 className="text-sm font-medium text-foreground">Portfolio Health</h3>
        </div>
        <Button size="sm" variant="outline" className="h-8 rounded-sm border-white/10 text-xs" onClick={handleRunCheck} disabled={isChecking}>
          <RefreshCw className={cn("mr-1.5 size-3", isChecking && "animate-spin")} />
          {isChecking ? "Checking..." : "Run Check"}
        </Button>
      </div>

      {health && (
        <div className={cn("glass-panel rounded-sm p-4 bg-gradient-to-br", getScoreGradient(health.overallScore))}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted uppercase tracking-wider">Overall Score</p>
              <p className={cn("text-3xl font-bold tabular-nums", getScoreColor(health.overallScore))}>{health.overallScore.toFixed(0)}</p>
            </div>
            {health.createdAt > 0 && (<p className="text-xs text-muted">Updated {formatRelativeTime(health.createdAt * 1000)}</p>)}
          </div>
        </div>
      )}

      {health && (
        <div className="glass-panel rounded-sm p-4">
          <div className="grid gap-4">
            <ScoreRow icon={<TrendingUp className="size-3.5" />} label="Drift Score" score={health.driftScore} description="How far from target allocation" />
            <ScoreRow icon={<PieChart className="size-3.5" />} label="Concentration" score={health.concentrationScore} description="Asset diversification health" />
            <ScoreRow icon={<Activity className="size-3.5" />} label="Performance" score={health.performanceScore} description="Recent portfolio performance" />
            <ScoreRow icon={<Shield className="size-3.5" />} label="Risk Score" score={health.riskScore} description="Overall risk assessment" />
          </div>
        </div>
      )}

      {driftItems.length > 0 && (
        <div className="glass-panel rounded-sm p-4">
          <h4 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Allocation Drift</h4>
          <div className="space-y-2">
            {driftItems.slice(0, 4).map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-foreground font-mono">{item.symbol}</span>
                <div className="flex items-center gap-3">
                  <span className="text-muted text-xs">{item.actualPct.toFixed(1)}% / {item.targetPct.toFixed(1)}%</span>
                  <span className={cn("text-xs font-medium", item.driftDirection === "overweight" ? "text-amber-400" : "text-blue-400")}>
                    {item.driftDirection === "overweight" ? "+" : "-"}{Math.abs(item.driftPct).toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="glass-panel rounded-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="size-4 text-amber-500" />
            <h4 className="text-xs font-medium text-muted uppercase tracking-wider">Active Alerts ({alerts.length})</h4>
          </div>
          <div className="space-y-2">
            {alerts.slice(0, 3).map((alert) => (
              <div key={alert.id} className={cn("rounded-sm border p-3", alert.severity === "critical" ? "border-red-500/30 bg-red-500/5" : alert.severity === "high" ? "border-orange-500/30 bg-orange-500/5" : "border-white/10 bg-white/5")}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{alert.title}</p>
                    <p className="text-xs text-muted mt-0.5">{alert.message}</p>
                  </div>
                  <span className={cn("text-[10px] font-medium uppercase tracking-wider", alert.severity === "critical" ? "text-red-400" : alert.severity === "high" ? "text-orange-400" : "text-muted")}>{alert.severity}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!health && (
        <div className="glass-panel rounded-sm p-8 text-center">
          <Activity className="size-8 mx-auto mb-3 text-muted" />
          <p className="text-sm text-muted">No health data available</p>
          <p className="text-xs text-muted/70 mt-1">Run a health check to get started</p>
        </div>
      )}
    </div>
  );
}

function ScoreRow({ icon, label, score, description }: { icon: React.ReactNode; label: string; score: number; description: string }) {
  const getScoreColor = (s: number) => {
    if (s >= 80) return "text-green-400";
    if (s >= 60) return "text-yellow-400";
    if (s >= 40) return "text-orange-400";
    return "text-red-400";
  };
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-7 items-center justify-center rounded-sm bg-white/5 text-muted">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-foreground">{label}</span>
          <span className={cn("text-xs font-medium tabular-nums", getScoreColor(score))}>{score.toFixed(0)}</span>
        </div>
        <Progress value={score} max={100} className="h-1" />
        <p className="text-[10px] text-muted/70 mt-1">{description}</p>
      </div>
    </div>
  );
}
