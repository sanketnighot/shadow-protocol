import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import {
  fetchMarketOpportunities,
  hasTauriRuntime,
  refreshMarketOpportunities,
} from "@/lib/market";
import { logError } from "@/lib/logger";
import type {
  MarketFetchInput,
  MarketOpportunitiesResponse,
} from "@/types/market";

const EMPTY_RESPONSE: MarketOpportunitiesResponse = {
  items: [],
  generatedAt: 0,
  nextRefreshAt: 0,
  stale: true,
  availableChains: ["all", "ethereum", "base", "polygon", "flow", "multi_chain"],
  availableCategories: ["all", "yield", "spread_watch", "rebalance", "catalyst"],
};

type UseMarketOpportunitiesInput = MarketFetchInput;

export function useMarketOpportunities(input: UseMarketOpportunitiesInput) {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const tauriRuntime = hasTauriRuntime();
  const normalizedWallets = useMemo(
    () =>
      (input.walletAddresses ?? [])
        .map((address) => address.trim())
        .filter((address) => address.startsWith("0x") && address.length === 42),
    [input.walletAddresses],
  );

  const query = useQuery({
    queryKey: [
      "market",
      "opportunities",
      input.category ?? "all",
      input.chain ?? "all",
      input.includeResearch ?? true,
      normalizedWallets,
    ],
    queryFn: async (): Promise<MarketOpportunitiesResponse> => {
      if (!tauriRuntime) {
        return EMPTY_RESPONSE;
      }
      return fetchMarketOpportunities({
        category: input.category,
        chain: input.chain,
        includeResearch: input.includeResearch,
        walletAddresses: normalizedWallets,
        limit: input.limit,
      });
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!tauriRuntime) {
      return;
    }
    let unlistenUpdated: UnlistenFn | null = null;
    let unlistenFailed: UnlistenFn | null = null;

    async function bind() {
      unlistenUpdated = await listen("market_opportunities_updated", () => {
        void queryClient.invalidateQueries({ queryKey: ["market"] });
      });
      unlistenFailed = await listen("market_opportunities_refresh_failed", () => {
        void queryClient.invalidateQueries({ queryKey: ["market"] });
      });
    }

    bind().catch((error) =>
      logError("Failed to bind market opportunity listeners", error),
    );

    return () => {
      if (unlistenUpdated) {
        unlistenUpdated();
      }
      if (unlistenFailed) {
        unlistenFailed();
      }
    };
  }, [queryClient, tauriRuntime]);

  const refresh = async () => {
    if (!tauriRuntime || isRefreshing) {
      return;
    }
    setIsRefreshing(true);
    try {
      await refreshMarketOpportunities({
        includeResearch: input.includeResearch,
        walletAddresses: normalizedWallets,
        force: true,
      });
      await queryClient.invalidateQueries({ queryKey: ["market"] });
    } finally {
      setIsRefreshing(false);
    }
  };

  return {
    response: query.data ?? EMPTY_RESPONSE,
    items: query.data?.items ?? EMPTY_RESPONSE.items,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isRefreshing,
    refresh,
    error: (() => {
      const queryError: unknown = query.error;
      if (typeof queryError === "string") {
        return queryError;
      }
      if (queryError instanceof Error) {
        return queryError.message;
      }
      return null;
    })(),
    hasWalletContext: normalizedWallets.length > 0,
  };
}
