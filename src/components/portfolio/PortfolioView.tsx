import { useMemo, useState } from "react";

import { AssetRow } from "@/components/portfolio/AssetRow";
import { PortfolioFilters } from "@/components/portfolio/PortfolioFilters";
import { usePortfolio } from "@/hooks/usePortfolio";

export function PortfolioView() {
  const { assets } = usePortfolio();
  const [chain, setChain] = useState("All");
  const [type, setType] = useState("All");
  const [sort, setSort] = useState("Value");

  const filteredAssets = useMemo(() => {
    const parseValue = (value: string) => Number(value.replace(/[$,]/g, ""));
    const nextAssets = assets.filter((asset) => {
      const chainMatches = chain === "All" || asset.chain === chain;
      const typeMatches = type === "All" || asset.type === type;

      return chainMatches && typeMatches;
    });

    return [...nextAssets].sort((left, right) => {
      if (sort === "Chain") {
        return left.chainName.localeCompare(right.chainName);
      }

      if (sort === "Symbol") {
        return left.symbol.localeCompare(right.symbol);
      }

      return parseValue(right.valueUsd) - parseValue(left.valueUsd);
    });
  }, [assets, chain, sort, type]);

  return (
    <div className="space-y-6">
      <section className="glass-panel rounded-[24px] border border-white/10 p-5 sm:p-6">
        <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
          All assets
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-foreground">
          Unified cross-chain asset view with execution shortcuts.
        </h1>
        <div className="mt-6">
          <PortfolioFilters
            chain={chain}
            sort={sort}
            type={type}
            onChainChange={setChain}
            onSortChange={setSort}
            onTypeChange={setType}
          />
        </div>
      </section>

      <div className="space-y-4">
        {filteredAssets.map((asset) => (
          <AssetRow key={asset.id} asset={asset} />
        ))}
      </div>
    </div>
  );
}
