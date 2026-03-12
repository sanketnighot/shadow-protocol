import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Wallet } from "lucide-react";

import { AssetList } from "@/components/portfolio/AssetList";
import { BridgeModal } from "@/components/portfolio/BridgeModal";
import { PortfolioFilters } from "@/components/portfolio/PortfolioFilters";
import { SendModal } from "@/components/portfolio/SendModal";
import { SwapModal } from "@/components/portfolio/SwapModal";
import { CreateWalletModal } from "@/components/wallet/CreateWalletModal";
import { ImportWalletModal } from "@/components/wallet/ImportWalletModal";
import { WalletEmptyState } from "@/components/wallet/WalletEmptyState";
import { WalletTabs } from "@/components/wallet/WalletTabs";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/shared/Skeleton";
import { Button } from "@/components/ui/button";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useToast } from "@/hooks/useToast";
import { useUiStore } from "@/store/useUiStore";
import { useWalletStore } from "@/store/useWalletStore";

export function PortfolioView() {
  const { addresses, activeAddress, refreshWallets } = useWalletStore();
  const { assets, isLoading, isFetching, refetch, balanceError } = usePortfolio({
    addresses,
    activeAddress,
  });
  const { success } = useToast();
  const [chain, setChain] = useState("All");
  const [type, setType] = useState("All");
  const [sort, setSort] = useState("Value");
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [isImportOpen, setImportOpen] = useState(false);
  const closePortfolioAction = useUiStore((state) => state.closePortfolioAction);
  const portfolioAction = useUiStore((state) => state.portfolioAction);

  useEffect(() => {
    void refreshWallets();
  }, [refreshWallets]);

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

  const hasWallets = addresses.length > 0;

  return (
    <div className="space-y-8">
      <section className="rounded-[24px] border border-white/10 bg-[#14141a] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
              {hasWallets ? "All assets" : "Wallets"}
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-foreground">
              {hasWallets
                ? "Unified cross-chain asset view with execution shortcuts."
                : "Create or import a wallet to get started."}
            </h1>
          </div>
          <div className="flex gap-2">
            {hasWallets && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full border-white/10"
                onClick={() => void refetch()}
                disabled={isFetching}
              >
                <RefreshCw
                  className={`mr-2 size-4 ${isFetching ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              className="rounded-full"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-2 size-4" />
              Create
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full border-white/10"
              onClick={() => setImportOpen(true)}
            >
              Import
            </Button>
          </div>
        </div>

        {hasWallets && (
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
        )}
      </section>

      <div className="space-y-6">
        {!hasWallets ? (
          <WalletEmptyState
            onCreate={() => setCreateOpen(true)}
            onImport={() => setImportOpen(true)}
          />
        ) : (
          <>
            <div className="rounded-[24px] border border-white/10 bg-[#14141a] p-4">
              <p className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
                Wallets
              </p>
              <WalletTabs />
            </div>
            {isLoading ? (
              <>
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </>
            ) : balanceError ? (
              <EmptyState
                icon={<Wallet className="size-5" />}
                title="Unable to load balances"
                description={balanceError}
                actionLabel={undefined}
                onAction={undefined}
              />
            ) : filteredAssets.length > 0 ? (
              <AssetList assets={filteredAssets} />
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
          </>
        )}
      </div>

      <CreateWalletModal open={isCreateOpen} onOpenChange={setCreateOpen} />
      <ImportWalletModal open={isImportOpen} onOpenChange={setImportOpen} />

      <SendModal
        open={portfolioAction?.action === "send"}
        asset={selectedAsset}
        fromAddress={activeAddress}
        onClose={closePortfolioAction}
        onSubmit={(amount, address, txHash) => {
          closePortfolioAction();
          success(
            "Transfer sent",
            `${amount} ${selectedAsset?.symbol ?? ""} to ${address.slice(0, 10)}… — ${txHash.slice(0, 18)}…`,
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
