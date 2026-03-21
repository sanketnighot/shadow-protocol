import { Image, Layers } from "lucide-react";

import type { NftDisplay } from "@/hooks/useNfts";
import { EmptyState } from "@/components/shared/EmptyState";

type NftGridProps = {
  nfts: NftDisplay[];
  isLoading?: boolean;
};

function chainBadge(chain: string): string {
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

export function NftGrid({ nfts, isLoading }: NftGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="aspect-square animate-pulse rounded-2xl border border-border bg-secondary"
          />
        ))}
      </div>
    );
  }

  if (nfts.length === 0) {
    return (
      <EmptyState
        icon={<Layers className="size-5" />}
        title="No NFTs yet"
        description="NFTs you own will appear here. Sync your wallet to fetch your collection."
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {nfts.map((nft) => (
        <div
          key={nft.id}
          className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-all hover:border-primary/30 hover:shadow-lg"
        >
          <div className="relative aspect-square overflow-hidden bg-secondary">
            {nft.imageUrl ? (
              <img
                src={nft.imageUrl}
                alt={nft.name ?? nft.tokenId}
                className="size-full object-cover transition-transform group-hover:scale-105"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-muted">
                <Image className="size-12 opacity-40" />
              </div>
            )}
            <div
              className="absolute bottom-1 right-1 flex size-6 items-center justify-center rounded-full border border-background bg-muted/90 font-mono text-[10px] font-semibold text-foreground"
              title={nft.chainName}
            >
              {chainBadge(nft.chain)}
            </div>
          </div>
          <div className="flex flex-col gap-1 p-3">
            <p className="truncate text-sm font-medium text-foreground">
              {nft.name ?? `#${nft.tokenId}`}
            </p>
            <p className="truncate font-mono text-[10px] text-muted">
              {nft.contract.slice(0, 6)}…{nft.contract.slice(-4)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
