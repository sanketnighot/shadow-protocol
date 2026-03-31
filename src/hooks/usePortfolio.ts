import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import { QUICK_ACTIONS } from "@/data/mock";
import type { Asset, ChainBalance, PortfolioPoint } from "@/data/mock";
import type {
  PortfolioAsset,
  PortfolioPerformanceRange,
} from "@/types/wallet";

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

  const queryClient = useQueryClient();
  const [isForceRefreshing, setIsForceRefreshing] = useState(false);

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

  const { data: history } = useQuery({
    queryKey: ["portfolio", "history", "30D"],
    queryFn: async (): Promise<PortfolioPerformanceRange> =>
      invoke("portfolio_fetch_history", { input: { range: "30D" } }),
    staleTime: 60_000,
  });

  const assets: Asset[] =
    rawAssets.length > 0
      ? rawAssets.map((pa) =>
          mapToAsset(pa, pa.walletAddress ?? addressesToFetch[0] ?? ""),
        )
      : [];

  const totalValue = useMemo(() => {
    if (assets.length === 0) return 0;
    return assets.reduce((sum, a) => {
      const v = Number(a.valueUsd.replace(/[$,]/g, ""));
      return sum + (Number.isNaN(v) ? 0 : v);
    }, 0);
  }, [assets]);

  const totalValueLabel =
    history?.summary.currentTotalUsd ?? (totalValue > 0 ? `$${totalValue.toFixed(2)}` : "$0.00");

  const chains: ChainBalance[] = useMemo(() => {
    const latestPoint =
      history?.points.length && history.points.length > 0
        ? history.points[history.points.length - 1]
        : null;
    const fromHistory = latestPoint?.chainBreakdown ?? [];
    if (fromHistory.length > 0) {
      const total = fromHistory.reduce(
        (sum: number, item) =>
          sum + Number(item.valueUsd.replace(/[$,]/g, "")),
        0,
      );
      return fromHistory.map((item) => ({
        symbol: item.chain ?? "Unknown",
        name: item.chain ?? "Unknown",
        valueLabel: item.valueUsd,
        allocation: total > 0 ? Math.round((Number(item.valueUsd.replace(/[$,]/g, "")) / total) * 100) : 0,
      }));
    }

    const byChain = new Map<string, { value: number; symbol: string; name: string }>();
    for (const a of assets) {
      const v = Number(a.valueUsd.replace(/[$,]/g, ""));
      if (Number.isNaN(v) || v <= 0) continue;
      const existing = byChain.get(a.chain);
      if (existing) {
        existing.value += v;
      } else {
        byChain.set(a.chain, { value: v, symbol: a.chain, name: a.chainName });
      }
    }
    const total = totalValue > 0 ? totalValue : 1;
    return Array.from(byChain.values())
      .map((c) => ({
        symbol: c.symbol,
        name: c.name,
        valueLabel: `$${c.value.toFixed(2)}`,
        allocation: Math.round((c.value / total) * 100),
      }))
      .sort((a, b) => b.allocation - a.allocation);
  }, [assets, totalValue, history]);

  const series: PortfolioPoint[] = useMemo(() => {
    const points = history?.points ?? [];
    if (points.length > 0) {
      return points.map((point, index) => ({
        day: index === points.length - 1 ? "Now" : new Date(point.timestamp * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        value: Number(point.totalUsd.replace(/[$,]/g, "")),
      }));
    }
    if (totalValue <= 0) return [{ day: "Now", value: 0 }];
    return [
      { day: "Prev", value: totalValue * 0.98 },
      { day: "Now", value: totalValue },
    ];
  }, [history, totalValue]);

  const targetSeries: PortfolioPoint[] = useMemo(() => {
    const points = history?.points ?? [];
    return points.map((point) => ({
      day: new Date(point.timestamp * 1000).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      value:
        Number(point.totalUsd.replace(/[$,]/g, "")) -
        Number(point.netFlowUsd.replace(/[$,]/g, "")),
    }));
  }, [history]);

  const forceRefresh = async () => {
    if (addressesToFetch.length === 0) return;
    setIsForceRefreshing(true);
    try {
      const fresh = await invoke<PortfolioAsset[]>("portfolio_force_refresh", {
        addresses: addressesToFetch,
      });
      queryClient.setQueryData(
        ["portfolio", "balances", addressesToFetch],
        fresh,
      );
    } finally {
      setIsForceRefreshing(false);
    }
  };

  return {
    assets,
    totalValueLabel,
    dailyChangeLabel:
      history?.summary.changeUsd && history?.summary.changePct
        ? `${history.summary.changeUsd} (${history.summary.changePct})`
        : "+0.00% (24h)",
    chains,
    series,
    targetSeries,
    quickActions: QUICK_ACTIONS,
    walletAttribution: history?.walletAttribution ?? [],
    allocationActual: history?.allocationActual ?? [],
    allocationTarget: history?.allocationTarget ?? [],
    performanceSummary: history?.summary ?? null,
    isLoading,
    isFetching: isFetching || isForceRefreshing,
    refetch,
    forceRefresh,
    balanceError: isError
      ? (typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to load balances")
      : null,
  };
}
