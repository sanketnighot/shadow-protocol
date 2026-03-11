import type { Asset } from "@/data/mock";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/store/useUiStore";

type AssetListProps = {
  assets: Asset[];
};

function AssetTableRow({ asset }: { asset: Asset }) {
  const openPortfolioAction = useUiStore((state) => state.openPortfolioAction);

  return (
    <tr className="border-b border-white/5 last:border-0">
      <td className="py-3 pr-4">
        <span className="font-semibold text-foreground">{asset.symbol}</span>
      </td>
      <td className="py-3 pr-4 text-sm text-muted">{asset.balance}</td>
      <td className="py-3 pr-4 text-right">
        <span className="font-medium text-foreground">{asset.valueUsd}</span>
      </td>
      <td className="py-3 pl-2">
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-full border-white/10 bg-white/5 px-3 text-xs text-foreground hover:bg-white/10"
            onClick={() => openPortfolioAction("send", asset.id)}
          >
            Send
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-full border-white/10 bg-white/5 px-3 text-xs text-foreground hover:bg-white/10"
            onClick={() => openPortfolioAction("swap", asset.id)}
          >
            Swap
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-full border-white/10 bg-white/5 px-3 text-xs text-foreground hover:bg-white/10"
            onClick={() => openPortfolioAction("bridge", asset.id)}
          >
            Bridge
          </Button>
        </div>
      </td>
    </tr>
  );
}

export function AssetList({ assets }: AssetListProps) {
  const byChain = assets.reduce<Record<string, Asset[]>>((acc, a) => {
    const key = a.chainName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

  const chains = Object.keys(byChain).sort();

  return (
    <div className="space-y-4">
      {chains.map((chainName) => {
        const chainAssets = byChain[chainName];
        const chainTotal = chainAssets.reduce((sum, a) => {
          const v = Number(a.valueUsd.replace(/[$,]/g, ""));
          return sum + (Number.isNaN(v) ? 0 : v);
        }, 0);

        return (
          <section
            key={chainName}
            className="glass-panel rounded-[24px] border border-white/10 overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <h2 className="font-semibold text-foreground">{chainName}</h2>
              <span className="text-sm text-muted">
                ${chainTotal.toFixed(2)} · {chainAssets.length} token
                {chainAssets.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px]">
                <thead>
                  <tr className="border-b border-white/10 text-left text-xs text-muted">
                    <th className="py-2.5 pr-4 font-medium">Token</th>
                    <th className="py-2.5 pr-4 font-medium">Balance</th>
                    <th className="py-2.5 pr-4 text-right font-medium">Value</th>
                    <th className="py-2.5 pl-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {chainAssets.map((asset) => (
                    <AssetTableRow key={asset.id} asset={asset} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
