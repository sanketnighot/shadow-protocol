import { motion } from "framer-motion";

import { AgentStatusCard } from "@/components/home/AgentStatusCard";
import { PortfolioCard } from "@/components/home/PortfolioCard";
import { QuickActions } from "@/components/home/QuickActions";

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
        <div className="glass-panel subtle-grid rounded-[24px] p-5 transition-colors sm:rounded-[28px] sm:p-6">
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
            <div className="rounded-2xl border border-border bg-secondary p-4 transition-transform hover:scale-[1.01]">
              <p className="text-sm font-semibold text-foreground">Private routing armed</p>
              <p className="mt-1 text-sm text-muted">Transaction privacy defaults to on for agent-assisted flows.</p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary p-4 transition-transform hover:scale-[1.01]">
              <p className="text-sm font-semibold text-foreground">Opportunity score: 82/100</p>
              <p className="mt-1 text-sm text-muted">Most interesting movement is concentrated on Base and Arbitrum.</p>
            </div>
          </div>
        </div>
      </motion.div>
      <motion.div variants={itemVariants}>
        <QuickActions />
      </motion.div>
    </motion.div>
  );
}
