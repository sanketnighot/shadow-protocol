import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export type TransactionDisplay = {
  id: string;
  txHash: string;
  chain: string;
  chainName: string;
  category: string | null;
  value: string | null;
  fromAddr: string | null;
  toAddr: string | null;
  timestamp: number | null;
  blockExplorerUrl: string;
};

type UseTransactionsParams = {
  addresses?: string[];
  activeAddress?: string | null;
  limit?: number;
};

export function useTransactions(params: UseTransactionsParams = {}) {
  const { addresses = [], activeAddress = null, limit = 100 } = params;
  const addressesToFetch =
    addresses.length > 0 ? addresses : activeAddress ? [activeAddress] : [];

  const {
    data: transactions = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["portfolio", "transactions", addressesToFetch, limit],
    queryFn: async (): Promise<TransactionDisplay[]> => {
      if (addressesToFetch.length === 0) return [];
      return invoke("portfolio_fetch_transactions", {
        addresses: addressesToFetch,
        limit,
      });
    },
    enabled: addressesToFetch.length > 0,
    staleTime: 60_000,
  });

  return { transactions, isLoading, isFetching, refetch };
}
