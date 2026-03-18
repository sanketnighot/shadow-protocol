import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export type NftDisplay = {
  id: string;
  contract: string;
  tokenId: string;
  chain: string;
  chainName: string;
  name: string | null;
  imageUrl: string | null;
};

type UseNftsParams = {
  addresses?: string[];
  activeAddress?: string | null;
};

export function useNfts(params: UseNftsParams = {}) {
  const { addresses = [], activeAddress = null } = params;
  const addressesToFetch =
    addresses.length > 0 ? addresses : activeAddress ? [activeAddress] : [];

  const {
    data: nfts = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["portfolio", "nfts", addressesToFetch],
    queryFn: async (): Promise<NftDisplay[]> => {
      if (addressesToFetch.length === 0) return [];
      return invoke("portfolio_fetch_nfts", {
        addresses: addressesToFetch,
      });
    },
    enabled: addressesToFetch.length > 0,
    staleTime: 60_000,
  });

  return { nfts, isLoading, isFetching, refetch };
}
