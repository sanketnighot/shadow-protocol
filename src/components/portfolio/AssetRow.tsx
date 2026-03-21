import type { Asset } from "@/data/mock";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/store/useUiStore";

type AssetRowProps = {
  asset: Asset;
};

export function AssetRow({ asset }: AssetRowProps) {
  const openPortfolioAction = useUiStore((state) => state.openPortfolioAction);

  return (
    <article className="glass-panel rounded-sm p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <p className="text-xl font-bold uppercase tracking-wider text-foreground">{asset.symbol}</p>
              <span className="rounded-sm border border-white/5 bg-secondary px-2 py-0.5 text-[10px] font-mono uppercase text-muted">
                {asset.chainName}
              </span>
            </div>
            <p className="mt-1 font-mono text-sm text-muted-foreground">{asset.balance}</p>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="text-right">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted">Value</p>
            <p className="font-mono text-lg font-semibold text-foreground">{asset.valueUsd}</p>
          </div>
          <div className="flex flex-wrap gap-2 ml-4">
            <Button
              variant="outline"
              size="sm"
              className="rounded-sm border-white/5 bg-secondary text-xs text-foreground hover:bg-white/5 active:scale-95"
              onClick={() => openPortfolioAction("send", asset.id)}
            >
              Send
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-sm border-white/5 bg-secondary text-xs text-foreground hover:bg-white/5 active:scale-95"
              onClick={() => openPortfolioAction("swap", asset.id)}
            >
              Swap
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-sm border-white/5 bg-secondary text-xs text-foreground hover:bg-white/5 active:scale-95"
              onClick={() => openPortfolioAction("bridge", asset.id)}
            >
              Bridge
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
