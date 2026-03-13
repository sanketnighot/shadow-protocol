import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import {
  PORTFOLIO_CHAINS,
  PORTFOLIO_SERIES,
  QUICK_ACTIONS,
} from "@/data/mock";
import type { Asset } from "@/data/mock";
import type { PortfolioAsset } from "@/types/wallet";

type PortfolioParams = {
  addresses?: string[];
  activeAddress?: string | null;
};

function mapToAsset(pa: PortfolioAsset, walletAddress: string): Asset {
  return {
    id: pa.id,
    symbol: pa.symbol,
    chain: pa.chain,
    chainName: pa.chainName,
    balance: pa.balance,
    valueUsd: pa.valueUsd,
    type: pa.type,
    walletAddress,
    tokenContract: pa.tokenContract ?? "",
    decimals: pa.decimals ?? 18,
  };
}

export function usePortfolio(params: PortfolioParams = {}) {
  const { addresses = [], activeAddress = null } = params;
  const addressesToFetch =
    addresses.length > 0 ? addresses : activeAddress ? [activeAddress] : [];

  const {
    data: rawAssets = [],
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["portfolio", "balances", addressesToFetch],
    queryFn: async (): Promise<PortfolioAsset[]> => {
      if (addressesToFetch.length === 0) return [];
      if (addressesToFetch.length === 1) {
        return invoke("portfolio_fetch_balances", {
          address: addressesToFetch[0],
        });
      }
      return invoke("portfolio_fetch_balances_multi", {
        addresses: addressesToFetch,
      });
    },
    enabled: addressesToFetch.length > 0,
    staleTime: 60_000,
    retry: false,
  });

  const assets: Asset[] =
    rawAssets.length > 0
      ? rawAssets.map((pa) =>
          mapToAsset(pa, pa.walletAddress ?? addressesToFetch[0] ?? ""),
        )
      : [];

  const totalValueLabel =
    assets.length > 0
      ? `$${assets
          .reduce((sum, a) => {
            const v = Number(a.valueUsd.replace(/[$,]/g, ""));
            return sum + (Number.isNaN(v) ? 0 : v);
          }, 0)
          .toFixed(2)}`
      : "$0.00";

  return {
    assets,
    totalValueLabel,
    dailyChangeLabel: "+0% (24h)",
    chains: PORTFOLIO_CHAINS,
    series: PORTFOLIO_SERIES,
    quickActions: QUICK_ACTIONS,
    isLoading,
    isFetching,
    refetch,
    balanceError: isError
      ? (typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to load balances")
      : null,
  };
}
