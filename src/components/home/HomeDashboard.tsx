import { useMemo } from "react";
import { motion } from "framer-motion";

import { AgentStatusCard } from "@/components/home/AgentStatusCard";
import { PortfolioCard } from "@/components/home/PortfolioCard";
import { QuickActions } from "@/components/home/QuickActions";
import { useMarketOpportunities } from "@/hooks/useMarketOpportunities";
import { useWalletStore } from "@/store/useWalletStore";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

export function HomeDashboard() {
  const addresses = useWalletStore((state) => state.addresses);
  const { items } = useMarketOpportunities({
    category: undefined,
    chain: "all",
    includeResearch: true,
    walletAddresses: addresses,
    limit: 5,
  });

  const { topScore, marketStatus, topChains } = useMemo(() => {
    if (items.length === 0) {
      return { topScore: null, marketStatus: "Markets calm. Capital ready.", topChains: [] };
    }
    const scores = items.map((i) => i.score);
    const maxScore = Math.max(...scores);
    const avgConfidence = items.reduce((sum, i) => sum + i.confidence, 0) / items.length;
    const topChainSet = [...new Set(items.slice(0, 3).map((i) => i.chain))];

    let status = "Markets calm. Capital ready.";
    if (maxScore >= 80) {
      status = "High opportunity conditions detected.";
    } else if (maxScore >= 60) {
      status = "Moderate opportunities available.";
    } else if (avgConfidence > 0.7) {
      status = "Active monitoring in progress.";
    }

    return {
      topScore: maxScore,
      marketStatus: status,
      topChains: topChainSet,
    };
  }, [items]);

  return (
    <motion.div
      className="space-y-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants}>
        <PortfolioCard />
      </motion.div>
      <motion.div
        className="grid gap-6 xl:grid-cols-[1.6fr_1fr]"
        variants={itemVariants}
      >
        <AgentStatusCard />
        <div className="glass-panel subtle-grid rounded-sm p-5 transition-colors sm:rounded-sm sm:p-6">
          <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
            Live posture
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-foreground">
            {marketStatus}
          </h2>
          <p className="mt-4 text-sm leading-6 text-muted">
            SHADOW is watching volatility, liquidity depth, and execution slippage across your preferred chains.
          </p>
          <div className="mt-8 space-y-3">
            <div className="rounded-sm border border-border bg-secondary p-4 transition-transform hover:scale-[1.01]">
              <p className="text-sm font-semibold text-foreground">Private routing armed</p>
              <p className="mt-1 text-sm text-muted">Transaction privacy defaults to on for agent-assisted flows.</p>
            </div>
            {topScore !== null && (
              <div className="rounded-sm border border-border bg-secondary p-4 transition-transform hover:scale-[1.01]">
                <p className="text-sm font-semibold text-foreground">Opportunity score: {topScore}/100</p>
                <p className="mt-1 text-sm text-muted">
                  {topChains.length > 0
                    ? `Most interesting movement is concentrated on ${topChains.join(" and ")}.`
                    : "Scanning across all chains."}
                </p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
      <motion.div variants={itemVariants}>
        <QuickActions />
      </motion.div>
    </motion.div>
  );
}
