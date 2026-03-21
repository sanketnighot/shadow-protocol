import type { Asset } from "@/data/mock";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/store/useUiStore";

type AssetRowProps = {
  asset: Asset;
};

export function AssetRow({ asset }: AssetRowProps) {
  const openPortfolioAction = useUiStore((state) => state.openPortfolioAction);

  return (
    <article className="glass-panel rounded-[24px] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <p className="text-xl font-semibold text-foreground">{asset.symbol}</p>
            <span className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-muted">
              {asset.chainName}
            </span>
          </div>
          <p className="mt-3 text-sm text-muted">{asset.balance}</p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm text-muted">Value</p>
            <p className="mt-1 font-semibold text-foreground">{asset.valueUsd}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="rounded-full border-border bg-secondary text-foreground hover:bg-surface-elevated active:scale-95"
              onClick={() => openPortfolioAction("send", asset.id)}
            >
              Send
            </Button>
            <Button
              variant="outline"
              className="rounded-full border-border bg-secondary text-foreground hover:bg-surface-elevated active:scale-95"
              onClick={() => openPortfolioAction("swap", asset.id)}
            >
              Swap
            </Button>
            <Button
              variant="outline"
              className="rounded-full border-border bg-secondary text-foreground hover:bg-surface-elevated active:scale-95"
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
