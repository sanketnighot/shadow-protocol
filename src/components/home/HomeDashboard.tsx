import { AgentStatusCard } from "@/components/home/AgentStatusCard";
import { PortfolioCard } from "@/components/home/PortfolioCard";
import { QuickActions } from "@/components/home/QuickActions";

export function HomeDashboard() {
  return (
    <div className="space-y-6">
      <PortfolioCard />
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <AgentStatusCard />
        <div className="glass-panel subtle-grid rounded-[28px] border border-white/10 p-6">
          <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
            Live posture
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-foreground">
            Markets calm. Capital ready.
          </h2>
          <p className="mt-4 text-sm leading-6 text-muted">
            SHADOW is watching volatility, liquidity depth, and execution slippage across your preferred chains.
          </p>
          <div className="mt-8 space-y-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold text-foreground">Private routing armed</p>
              <p className="mt-1 text-sm text-muted">Transaction privacy defaults to on for agent-assisted flows.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold text-foreground">Opportunity score: 82/100</p>
              <p className="mt-1 text-sm text-muted">Most interesting movement is concentrated on Base and Arbitrum.</p>
            </div>
          </div>
        </div>
      </div>
      <QuickActions />
    </div>
  );
}
