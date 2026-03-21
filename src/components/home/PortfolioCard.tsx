import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

import { ChainPill } from "@/components/shared/ChainPill";
import { PortfolioChart } from "@/components/shared/PortfolioChart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCountUp } from "@/hooks/useCountUp";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useWalletStore } from "@/store/useWalletStore";

export function PortfolioCard() {
  const { addresses, activeAddress } = useWalletStore();
  const { chains, dailyChangeLabel, series, totalValueLabel } = usePortfolio({
    addresses,
    activeAddress,
  });
  const totalValue = Number(totalValueLabel.replace(/[$,]/g, "")) || 0;
  const animatedTotalValue = useCountUp(totalValue);

  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="glass-panel overflow-hidden rounded-sm text-foreground sm:rounded-md">
        <CardHeader className="gap-4">
          <CardDescription className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
            Total Portfolio Value
          </CardDescription>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="font-mono text-3xl font-extrabold tracking-tighter sm:text-4xl lg:text-5xl">
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  minimumFractionDigits: 2,
                }).format(animatedTotalValue)}
              </CardTitle>
              <div className="mt-3 inline-flex items-center gap-2 rounded-sm border border-emerald-400/10 bg-emerald-400/8 px-3 py-1 text-sm text-emerald-300">
                <ArrowUpRight className="size-4" />
                {dailyChangeLabel}
              </div>
            </div>
            <p className="max-w-sm text-sm leading-6 text-muted">
              Unified capital across Ethereum, Arbitrum, Base, and Solana with AI-monitored guardrails.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {chains.map((chain) => (
              <ChainPill key={chain.symbol} {...chain} />
            ))}
          </div>
          <PortfolioChart data={series} />
        </CardContent>
      </Card>
    </motion.div>
  );
}
