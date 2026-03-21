import { useState } from "react";
import { ArrowRight, ArrowLeftRight, Repeat } from "lucide-react";
import type { Asset } from "@/data/mock";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useUiStore } from "@/store/useUiStore";

type TokenCardProps = {
  asset: Asset;
};

function chainBadgeLabel(chain: string): string {
  const map: Record<string, string> = {
    ETH: "E",
    BASE: "B",
    POL: "P",
    "ETH-SEP": "ES",
    "BASE-SEP": "BS",
    "POL-AMOY": "PA",
  };
  return map[chain] ?? chain.slice(0, 2).toUpperCase();
}

function tokenColor(symbol: string): string {
  const colors: Record<string, string> = {
    ETH: "from-blue-500/40 to-cyan-500/40",
    WETH: "from-violet-500/40 to-purple-500/40",
    USDC: "from-blue-600/40 to-indigo-600/40",
    USDT: "from-emerald-600/40 to-teal-600/40",
    DAI: "from-amber-500/40 to-orange-500/40",
    ARB: "from-blue-400/40 to-sky-400/40",
    POL: "from-purple-500/40 to-violet-600/40",
  };
  return colors[symbol] ?? "from-white/10 to-white/5";
}

function getMockApy(symbol: string): string | null {
  const yields: Record<string, string> = {
    ETH: "3.2% APY",
    USDC: "5.1% APY",
    DAI: "4.8% APY",
  };
  return yields[symbol] ?? null;
}

export function TokenCard({ asset }: TokenCardProps) {
  const [popupOpen, setPopupOpen] = useState(false);
  const openPortfolioAction = useUiStore((state) => state.openPortfolioAction);

  const handleAction = (action: "send" | "swap" | "bridge", e?: React.MouseEvent) => {
    e?.stopPropagation();
    setPopupOpen(false);
    openPortfolioAction(action, asset.id);
  };

  const apy = getMockApy(asset.symbol);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setPopupOpen(true)}
        className="group relative flex w-full flex-col items-center gap-4 overflow-hidden rounded-sm border border-border bg-surface-elevated p-5 text-left transition-all duration-100 ease-out hover:-translate-y-0.5 hover:border-white/20 active:scale-[0.98]"
      >
        {/* APY Badge */}
        {apy && (
          <div className="absolute right-3 top-3 rounded-sm bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-emerald-500">
            {apy}
          </div>
        )}

        <div className="relative mt-2">
          <div
            className={`flex size-16 items-center justify-center rounded-sm bg-linear-to-br ${tokenColor(
              asset.symbol,
            )} text-2xl font-bold tracking-tighter text-foreground shadow-none border border-white/5 ring-1 ring-white/10`}
          >
            {asset.symbol.slice(0, 2)}
          </div>
          <div
            className="absolute -bottom-1.5 -right-1.5 flex size-6 items-center justify-center rounded-sm border-2 border-surface bg-muted/90 font-mono text-[9px] font-bold text-foreground shadow-none border border-white/5"
            title={asset.chainName}
          >
            {chainBadgeLabel(asset.chain)}
          </div>
        </div>

        <div className="w-full text-center">
          <p className="truncate text-base font-semibold uppercase tracking-widest text-foreground">
            {asset.symbol}
          </p>
          <div className="mt-1 flex items-baseline justify-center gap-1.5">
            <span className="font-mono text-lg font-bold text-foreground">{asset.valueUsd}</span>
          </div>
          <p className="mt-0.5 font-mono text-xs font-medium text-muted-foreground">{asset.balance}</p>
        </div>

        {/* Hover Quick Actions Overlay */}
        <div className="absolute inset-x-0 bottom-0 flex translate-y-full items-center justify-center gap-2 bg-black/80 px-2 pb-4 pt-10 backdrop-blur-md transition-transform duration-100 ease-out group-hover:translate-y-0">
          <button
            onClick={(e) => handleAction("send", e)}
            className="flex size-10 items-center justify-center rounded-sm bg-white/10 text-white transition-colors hover:bg-white/20"
            title="Send"
          >
            <ArrowRight className="size-4" />
          </button>
          <button
            onClick={(e) => handleAction("swap", e)}
            className="flex size-10 items-center justify-center rounded-sm bg-white/10 text-white transition-colors hover:bg-white/20"
            title="Swap"
          >
            <Repeat className="size-4" />
          </button>
          <button
            onClick={(e) => handleAction("bridge", e)}
            className="flex size-10 items-center justify-center rounded-sm bg-white/10 text-white transition-colors hover:bg-white/20"
            title="Bridge"
          >
            <ArrowLeftRight className="size-4" />
          </button>
        </div>
      </div>

      <Dialog open={popupOpen} onOpenChange={setPopupOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] rounded-sm border border-border bg-surface p-6 sm:max-w-sm sm:p-8">
          <div className="flex flex-col items-center gap-6">
            <div className="relative">
              <div
                className={`flex size-20 items-center justify-center rounded-sm bg-linear-to-br ${tokenColor(
                  asset.symbol,
                )} text-3xl font-bold text-foreground shadow-none border border-white/5`}
              >
                {asset.symbol.slice(0, 2)}
              </div>
              <div
                className="absolute -bottom-2 -right-2 flex size-8 items-center justify-center rounded-sm border-[3px] border-[#14141a] bg-muted text-xs font-bold text-foreground"
                title={asset.chainName}
              >
                {chainBadgeLabel(asset.chain)}
              </div>
            </div>
            <div className="text-center">
              <DialogTitle className="text-2xl font-bold tracking-tight">
                {asset.symbol}
              </DialogTitle>
              <p className="mt-1.5 text-sm font-medium text-muted">{asset.chainName}</p>
              <div className="mt-4 flex flex-col items-center justify-center gap-1">
                <span className="text-3xl font-bold tracking-tight text-foreground">
                  {asset.valueUsd}
                </span>
                <span className="text-sm font-medium text-muted">{asset.balance}</span>
              </div>
            </div>
            <div className="flex w-full flex-col gap-3">
              <Button
                className="w-full rounded-sm py-6 text-base font-semibold shadow-none border border-white/5 shadow-primary/20"
                onClick={() => handleAction("send")}
              >
                Send
              </Button>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="rounded-sm border-white/10 bg-white/5 py-6 font-medium hover:bg-white/10 hover:text-foreground"
                  onClick={() => handleAction("swap")}
                >
                  Swap
                </Button>
                <Button
                  variant="outline"
                  className="rounded-sm border-white/10 bg-white/5 py-6 font-medium hover:bg-white/10 hover:text-foreground"
                  onClick={() => handleAction("bridge")}
                >
                  Bridge
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
