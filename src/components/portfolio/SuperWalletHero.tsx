import {
  ArrowRight,
  ArrowLeftRight,
  Repeat,
  Download,
  Wallet,
  Sparkles,
} from "lucide-react";
import { PortfolioChart } from "@/components/shared/PortfolioChart";
import type { ChainBalance, PortfolioPoint } from "@/data/mock";

type SuperWalletHeroProps = {
  totalValueLabel: string;
  dailyChangeLabel: string;
  chains: ChainBalance[];
  series: PortfolioPoint[];
  onAction: (action: "send" | "swap" | "bridge" | "receive") => void;
};

function chainColor(symbol: string): string {
  const map: Record<string, string> = {
    ETH: "bg-blue-500",
    BASE: "bg-blue-600",
    POL: "bg-purple-500",
  };
  return map[symbol] ?? "bg-muted/20";
}

export function SuperWalletHero({
  totalValueLabel,
  dailyChangeLabel,
  chains,
  series,
  onAction,
}: SuperWalletHeroProps) {
  return (
    <section className="relative overflow-hidden rounded-[32px] border border-border bg-surface p-6 sm:p-8 shadow-sm">
      {/* Background Glow */}
      <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-primary/20 blur-[100px]" />

      <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
        {/* Left: Net Worth & Chains */}
        <div className="flex flex-1 flex-col justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-muted">
              <Wallet className="size-4" />
              <p className="font-mono text-xs font-semibold tracking-[0.2em] uppercase">
                Total Net Worth
              </p>
            </div>
            <div className="mt-4 flex items-baseline gap-3">
              <h1 className="text-5xl font-extrabold tracking-tight text-foreground sm:text-6xl">
                {totalValueLabel}
              </h1>
              <span className="text-sm font-semibold text-emerald-400">
                {dailyChangeLabel}
              </span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => onAction("receive")}
              className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:-translate-y-0.5 active:scale-95"
            >
              <Download className="size-4" />
              Receive
            </button>
            <button
              onClick={() => onAction("send")}
              className="flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-white/15 active:scale-95"
            >
              <ArrowRight className="size-4" />
              Send
            </button>
            <button
              onClick={() => onAction("swap")}
              className="flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-white/15 active:scale-95"
            >
              <Repeat className="size-4" />
              Swap
            </button>
            <button
              onClick={() => onAction("bridge")}
              className="flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-white/15 active:scale-95"
            >
              <ArrowLeftRight className="size-4" />
              Bridge
            </button>
            <button
              className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary transition-all hover:bg-primary/20 active:scale-95"
              onClick={() => alert("Earn strategies coming soon!")}
            >
              <Sparkles className="size-4" />
              Earn
            </button>
          </div>

          {/* Chain Distribution */}
          {chains.length > 0 && (
            <div className="mt-2 w-full max-w-md">
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted">
                <span>Network Distribution</span>
              </div>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/5">
                {chains.map((c) => (
                  <div
                    key={c.symbol}
                    className={`h-full ${chainColor(c.symbol)}`}
                    style={{ width: `${c.allocation}%` }}
                    title={`${c.name}: ${c.allocation}%`}
                  />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                {chains.map((c) => (
                  <div key={c.symbol} className="flex items-center gap-1.5">
                    <div className={`size-2 rounded-full ${chainColor(c.symbol)}`} />
                    <span className="text-[11px] font-medium text-muted">
                      {c.name} {c.allocation}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Portfolio Chart */}
        <div className="h-[240px] w-full lg:w-[40%] xl:w-[45%]">
          <PortfolioChart data={series} />
        </div>
      </div>
    </section>
  );
}
