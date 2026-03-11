import { useMemo, useState } from "react";
import { Wallet } from "lucide-react";

import { AssetRow } from "@/components/portfolio/AssetRow";
import { BridgeModal } from "@/components/portfolio/BridgeModal";
import { PortfolioFilters } from "@/components/portfolio/PortfolioFilters";
import { SendModal } from "@/components/portfolio/SendModal";
import { SwapModal } from "@/components/portfolio/SwapModal";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/shared/Skeleton";
import { useSimulatedLoading } from "@/hooks/useSimulatedLoading";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useToast } from "@/hooks/useToast";
import { useUiStore } from "@/store/useUiStore";

export function PortfolioView() {
  const { assets } = usePortfolio();
  const { success } = useToast();
  const isLoading = useSimulatedLoading();
  const [chain, setChain] = useState("All");
  const [type, setType] = useState("All");
  const [sort, setSort] = useState("Value");
  const closePortfolioAction = useUiStore((state) => state.closePortfolioAction);
  const portfolioAction = useUiStore((state) => state.portfolioAction);

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

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === portfolioAction?.assetId) ?? null,
    [assets, portfolioAction?.assetId],
  );

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
        {isLoading ? (
          <>
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </>
        ) : filteredAssets.length > 0 ? (
          filteredAssets.map((asset) => <AssetRow key={asset.id} asset={asset} />)
        ) : (
          <EmptyState
            icon={<Wallet className="size-5" />}
            title="No assets match these filters"
            description="Adjust the chain or asset type filters to bring balances back into view."
            actionLabel="Reset filters"
            onAction={() => {
              setChain("All");
              setType("All");
              setSort("Value");
            }}
          />
        )}
      </div>

      <SendModal
        open={portfolioAction?.action === "send"}
        asset={selectedAsset}
        onClose={closePortfolioAction}
        onSubmit={(amount, address) => {
          closePortfolioAction();
          success(
            `Send draft ready for ${selectedAsset?.symbol ?? "asset"}`,
            `${amount} ${selectedAsset?.symbol ?? ""} will be routed to ${address}.`,
          );
        }}
      />
      <SwapModal
        open={portfolioAction?.action === "swap"}
        asset={selectedAsset}
        onClose={closePortfolioAction}
        onSubmit={(amount, targetSymbol) => {
          closePortfolioAction();
          success(
            "Swap preview generated",
            `${amount} ${selectedAsset?.symbol ?? ""} routed into ${targetSymbol}.`,
          );
        }}
      />
      <BridgeModal
        open={portfolioAction?.action === "bridge"}
        asset={selectedAsset}
        onClose={closePortfolioAction}
        onSubmit={(amount, destinationChain) => {
          closePortfolioAction();
          success(
            "Bridge preview generated",
            `${amount} ${selectedAsset?.symbol ?? ""} prepared for ${destinationChain}.`,
          );
        }}
      />
    </div>
  );
}
