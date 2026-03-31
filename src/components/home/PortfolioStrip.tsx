import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useCountUp } from "@/hooks/useCountUp";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useWalletStore } from "@/store/useWalletStore";
import { cn } from "@/lib/utils";

export function PortfolioStrip() {
  const navigate = useNavigate();
  const { addresses, activeAddress } = useWalletStore();
  const { totalValueLabel, dailyChangeLabel, chains, isLoading } = usePortfolio({
    addresses,
    activeAddress,
  });

  const totalValue = Number(totalValueLabel.replace(/[$,]/g, "")) || 0;
  const animatedValue = useCountUp(totalValue, 1200);

  const isPositive = dailyChangeLabel.startsWith("+") || (!dailyChangeLabel.startsWith("-") && !dailyChangeLabel.startsWith("0"));
  const DeltaIcon = isPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <motion.div
      className="glass-panel subtle-grid rounded-sm p-5 sm:p-6 cursor-pointer group"
      onClick={() => navigate("/portfolio")}
      whileHover={{ scale: 1.002 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: value block */}
        <div className="flex items-end gap-6">
          <div>
            <p className="font-mono text-[10px] tracking-[0.28em] text-muted uppercase mb-2">
              Total Portfolio Value
            </p>
            {isLoading ? (
              <div className="h-10 w-48 rounded-sm bg-secondary animate-pulse" />
            ) : (
              <div className="flex items-end gap-4">
                <span className="font-mono text-4xl font-black tracking-tighter text-foreground tabular-nums sm:text-5xl">
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    minimumFractionDigits: 2,
                  }).format(animatedValue)}
                </span>
                <div
                  className={cn(
                    "mb-1.5 inline-flex items-center gap-1 rounded-sm border px-2.5 py-1 font-mono text-xs font-bold",
                    isPositive
                      ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-400"
                      : "border-red-500/20 bg-red-500/8 text-red-400",
                  )}
                >
                  <DeltaIcon className="size-3.5" />
                  {dailyChangeLabel}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: chain allocation bars + wallet count */}
        <div className="flex flex-col gap-3 lg:min-w-72 lg:max-w-96 w-full lg:w-auto">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] tracking-[0.28em] text-muted uppercase">
              Chain Allocation
            </p>
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
              <Wallet className="size-3" />
              {addresses.length} {addresses.length === 1 ? "wallet" : "wallets"}
            </div>
          </div>

          {chains.length === 0 ? (
            <div className="h-8 w-full rounded-sm bg-secondary animate-pulse" />
          ) : (
            <div className="space-y-1.5">
              {/* Stacked bar */}
              <div className="flex h-2 w-full overflow-hidden rounded-sm">
                {chains.map((chain, i) => (
                  <motion.div
                    key={chain.symbol}
                    className="h-full first:rounded-l-sm last:rounded-r-sm"
                    style={{
                      width: `${chain.allocation}%`,
                      backgroundColor: CHAIN_COLORS[i % CHAIN_COLORS.length],
                      opacity: 0.85,
                    }}
                    initial={{ scaleX: 0, originX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.3 + i * 0.1, duration: 0.5, ease: "easeOut" }}
                  />
                ))}
              </div>
              {/* Chain labels */}
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {chains.slice(0, 5).map((chain, i) => (
                  <div key={chain.symbol} className="flex items-center gap-1">
                    <div
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: CHAIN_COLORS[i % CHAIN_COLORS.length] }}
                    />
                    <span className="font-mono text-[10px] text-muted">
                      {chain.symbol} {chain.allocation}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom: tap hint */}
      <p className="mt-4 font-mono text-[10px] tracking-[0.2em] text-muted/50 uppercase group-hover:text-muted/80 transition-colors">
        View full portfolio →
      </p>
    </motion.div>
  );
}

const CHAIN_COLORS = [
  "#8b5cf6",
  "#3b82f6",
  "#059669",
  "#d97706",
  "#ec4899",
  "#06b6d4",
];
