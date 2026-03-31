import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Wallet } from "lucide-react";

import { AssetList } from "@/components/portfolio/AssetList";
import { BridgeModal } from "@/components/portfolio/BridgeModal";
import { ReceiveModal } from "@/components/portfolio/ReceiveModal";
import { NftGrid } from "@/components/portfolio/NftGrid";
import { PortfolioFilters } from "@/components/portfolio/PortfolioFilters";
import { PortfolioTabs } from "@/components/portfolio/PortfolioTabs";
import { SendModal } from "@/components/portfolio/SendModal";
import { SwapModal } from "@/components/portfolio/SwapModal";
import { TransactionList } from "@/components/portfolio/TransactionList";
import { SuperWalletHero } from "@/components/portfolio/SuperWalletHero";
import { WalletSelectorDropdown } from "@/components/portfolio/WalletSelectorDropdown";
import { SmartOpportunities } from "@/components/portfolio/SmartOpportunities";
import { CreateWalletModal } from "@/components/wallet/CreateWalletModal";
import { ImportWalletModal } from "@/components/wallet/ImportWalletModal";
import { WalletEmptyState } from "@/components/wallet/WalletEmptyState";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/shared/Skeleton";
import { Button } from "@/components/ui/button";
import { useAppsMarketplace } from "@/hooks/useApps";
import { useNfts } from "@/hooks/useNfts";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useTransactions } from "@/hooks/useTransactions";
import { useToast } from "@/hooks/useToast";
import { useSessionStore } from "@/store/useSessionStore";
import { useUiStore } from "@/store/useUiStore";
import { useWalletStore } from "@/store/useWalletStore";

type PortfolioTabId = "tokens" | "nfts" | "transactions";

export function PortfolioView() {
  const { addresses, activeAddress, refreshWallets } = useWalletStore();
  const { assets, totalValueLabel, dailyChangeLabel, chains, series, targetSeries, isLoading, isFetching, forceRefresh, balanceError } = usePortfolio({
    addresses,
    activeAddress,
  });
  const { nfts, isLoading: nftsLoading } = useNfts({ addresses, activeAddress });
  const { transactions, isLoading: txLoading } = useTransactions({
    addresses,
    activeAddress,
  });
  const { success } = useToast();
  const developerModeEnabled = useUiStore((s) => s.developerModeEnabled);
  const { data: marketplaceApps } = useAppsMarketplace();
  const installedAppIds = useMemo(
    () => (marketplaceApps ?? []).filter((a) => a.isInstalled && a.status === "active").map((a) => a.id),
    [marketplaceApps],
  );
  const [activeTab, setActiveTab] = useState<PortfolioTabId>("tokens");
  const [isReceiveOpen, setReceiveOpen] = useState(false);
  const [chain, setChain] = useState("All");
  const [type, setType] = useState("All");
  const [sort, setSort] = useState("Value");
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [isImportOpen, setImportOpen] = useState(false);
  const openUnlockDialog = useSessionStore((s) => s.openUnlockDialog);
  const closePortfolioAction = useUiStore((state) => state.closePortfolioAction);
  const portfolioAction = useUiStore((state) => state.portfolioAction);
  const openAction = useUiStore((state) => state.openPortfolioAction);

  useEffect(() => {
    void refreshWallets();
  }, [refreshWallets]);

  const filteredAssets = useMemo(() => {
    const parseValue = (value: string) => Number(value.replace(/[$,]/g, ""));
    const nextAssets = assets.filter((asset) => {
      const chainMatches = chain === "All" || asset.chain === chain;
      const typeMatches =
        type === "All" ||
        asset.type === type ||
        (type === "token" && asset.type === "native");

      const hasBalance = parseFloat(asset.balance.replace(/[^0-9.]/g, "")) > 0;
      const isTestnet = [
        "ETH-SEP",
        "BASE-SEP",
        "POL-AMOY",
        "FLOW-TEST",
        "FLOW-EVM-TEST",
        "FIL-CAL",
      ].includes(asset.chain);
      // If the user picked a specific chain (e.g. Flow EVM Testnet), show those rows even when
      // developer mode is off — otherwise the filter button and empty state contradict each other.
      const viewingThisChainExplicitly = chain !== "All" && asset.chain === chain;
      const devModeMatches =
        !isTestnet || developerModeEnabled || viewingThisChainExplicitly;

      return chainMatches && typeMatches && hasBalance && devModeMatches;
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
  }, [assets, chain, sort, type, developerModeEnabled]);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === portfolioAction?.assetId) ?? assets[0] ?? null,
    [assets, portfolioAction?.assetId],
  );

  const hasWallets = addresses.length > 0;

  const handleHeroAction = (action: "send" | "swap" | "bridge" | "receive") => {
    if (action === "receive") {
      setReceiveOpen(true);
      return;
    }
    if (selectedAsset) {
      openAction(action, selectedAsset.id);
    } else {
      success("Action required", "Please select an asset first or ensure you have a balance.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Actions (Create/Import/Refresh) */}
      <div className="flex items-center justify-end gap-2">
        {hasWallets && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-sm bg-white/5 hover:bg-white/10"
            onClick={() => void forceRefresh()}
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
          variant="outline"
          size="sm"
          className="rounded-sm border-white/10 bg-white/5 hover:bg-white/10"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="mr-2 size-4" />
          Create
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-sm border-white/10 bg-transparent hover:bg-white/5"
          onClick={() => setImportOpen(true)}
        >
          Import
        </Button>
      </div>

      {!hasWallets ? (
        <WalletEmptyState
          onCreate={() => setCreateOpen(true)}
          onImport={() => setImportOpen(true)}
        />
      ) : (
        <>
          {/* Main Hero Dashboard */}
          <SuperWalletHero
            totalValueLabel={totalValueLabel}
            dailyChangeLabel={dailyChangeLabel}
            chains={chains}
            series={series}
            targetSeries={targetSeries}
            onAction={handleHeroAction}
          />

          {/* Controls: Smart Selector */}
          <div className="flex items-center justify-between px-1">
            <WalletSelectorDropdown />
            <Button
              variant="outline"
              size="sm"
              className="rounded-sm border-primary/20 bg-primary/5 text-primary hover:bg-primary/10"
              onClick={() => {
                if (assets[0]) {
                  openAction("swap", assets[0].id);
                }
              }}
            >
              <RefreshCw className="mr-2 size-3.5" />
              Rebalance to Target
            </Button>
          </div>

          {/* Portfolio Tabs & Content */}
          <div className="rounded-sm border border-border bg-surface p-4 sm:p-6">
            <PortfolioTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
              tokensContent={
                <div className="mt-4 space-y-4">
                  <SmartOpportunities />

                  <div className="rounded-sm border border-border bg-white/2 p-3">
                    <PortfolioFilters
                      chain={chain}
                      sort={sort}
                      type={type}
                      developerModeEnabled={developerModeEnabled}
                      installedAppIds={installedAppIds}
                      onChainChange={setChain}
                      onSortChange={setSort}
                      onTypeChange={setType}
                    />
                  </div>

                  {isLoading ? (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-[220px] w-full rounded-sm" />
                      ))}
                    </div>
                  ) : balanceError ? (
                    <EmptyState
                      icon={<Wallet className="size-5" />}
                      title="Unable to load balances"
                      description={balanceError}
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
                </div>
              }
              nftsContent={
                <div className="mt-4">
                  <NftGrid nfts={nfts} isLoading={nftsLoading} />
                </div>
              }
              transactionsContent={
                <div className="mt-4">
                  <TransactionList
                    transactions={transactions}
                    isLoading={txLoading}
                  />
                </div>
              }
            />
          </div>
        </>
      )}

      <CreateWalletModal open={isCreateOpen} onOpenChange={setCreateOpen} />
      <ImportWalletModal open={isImportOpen} onOpenChange={setImportOpen} />
      <ReceiveModal open={isReceiveOpen} onClose={() => setReceiveOpen(false)} />

      <SendModal
        open={portfolioAction?.action === "send"}
        asset={selectedAsset}
        fromAddress={activeAddress}
        onClose={closePortfolioAction}
        onWalletLocked={() => openUnlockDialog()}
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
