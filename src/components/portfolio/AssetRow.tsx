import type { Asset } from "@/data/mock";
import { Button } from "@/components/ui/button";

type AssetRowProps = {
  asset: Asset;
};

export function AssetRow({ asset }: AssetRowProps) {
  return (
    <article className="glass-panel rounded-[24px] border border-white/10 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <p className="text-xl font-semibold text-foreground">{asset.symbol}</p>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted">
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
            <Button variant="outline" className="rounded-full border-white/10 bg-white/5 text-foreground hover:bg-white/10">
              Send
            </Button>
            <Button variant="outline" className="rounded-full border-white/10 bg-white/5 text-foreground hover:bg-white/10">
              Swap
            </Button>
            <Button variant="outline" className="rounded-full border-white/10 bg-white/5 text-foreground hover:bg-white/10">
              Bridge
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
