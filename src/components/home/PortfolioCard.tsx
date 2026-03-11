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
import { usePortfolio } from "@/hooks/usePortfolio";

export function PortfolioCard() {
  const { chains, dailyChangeLabel, series, totalValueLabel } = usePortfolio();

  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="glass-panel overflow-hidden rounded-[28px] border-white/10 bg-transparent text-foreground">
        <CardHeader className="gap-4">
          <CardDescription className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
            Total Portfolio Value
          </CardDescription>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-4xl font-extrabold tracking-[-0.04em] lg:text-5xl">
                {totalValueLabel}
              </CardTitle>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/10 bg-emerald-400/8 px-3 py-1 text-sm text-emerald-300">
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
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
