import { useState } from "react";
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

export function TokenCard({ asset }: TokenCardProps) {
  const [popupOpen, setPopupOpen] = useState(false);
  const openPortfolioAction = useUiStore((state) => state.openPortfolioAction);

  const handleAction = (action: "send" | "swap" | "bridge") => {
    setPopupOpen(false);
    openPortfolioAction(action, asset.id);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setPopupOpen(true)}
        className="flex w-full flex-col items-center gap-3 rounded-[20px] border border-white/10 bg-[#14141a] p-4 text-left transition-all duration-200 hover:scale-[1.02] hover:border-white/15 hover:shadow-lg active:scale-[0.98]"
      >
        <div className="relative">
          <div
            className={`flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br ${tokenColor(asset.symbol)} text-2xl font-bold text-foreground shadow-inner`}
          >
            {asset.symbol.slice(0, 2)}
          </div>
          <div
            className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full border border-background bg-muted/90 text-[10px] font-semibold text-foreground"
            title={asset.chainName}
          >
            {chainBadgeLabel(asset.chain)}
          </div>
        </div>
        <div className="w-full text-center">
          <p className="truncate text-sm font-medium text-foreground">
            {asset.symbol}
          </p>
          <p className="text-xs text-muted">{asset.balance}</p>
          <p className="mt-0.5 font-semibold text-foreground">{asset.valueUsd}</p>
        </div>
      </button>

      <Dialog open={popupOpen} onOpenChange={setPopupOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] rounded-[28px] border border-white/10 bg-[#14141a] p-6 sm:max-w-sm sm:p-6">
          <div className="flex flex-col items-center gap-5">
            <div className="relative">
              <div
                className={`flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br ${tokenColor(asset.symbol)} text-2xl font-bold text-foreground shadow-inner`}
              >
                {asset.symbol.slice(0, 2)}
              </div>
              <div
                className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-semibold text-foreground"
                title={asset.chainName}
              >
                {chainBadgeLabel(asset.chain)}
              </div>
            </div>
            <div className="text-center">
              <DialogTitle className="text-xl font-bold tracking-tight">
                {asset.symbol}
              </DialogTitle>
              <p className="mt-1 text-sm text-muted">{asset.chainName}</p>
              <div className="mt-3 flex items-center justify-center gap-4">
                <span className="text-sm text-muted">{asset.balance}</span>
                <span className="font-semibold text-foreground">{asset.valueUsd}</span>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2">
              <Button
                className="w-full rounded-2xl py-6 text-base font-medium"
                onClick={() => handleAction("send")}
              >
                Send
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="rounded-2xl border-white/10 bg-white/5 py-5 hover:bg-white/10"
                  onClick={() => handleAction("swap")}
                >
                  Swap
                </Button>
                <Button
                  variant="outline"
                  className="rounded-2xl border-white/10 bg-white/5 py-5 hover:bg-white/10"
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
