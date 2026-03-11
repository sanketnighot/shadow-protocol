import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { persist } from "zustand/middleware";

import type { WalletListResult } from "@/types/wallet";

type WalletStore = {
  addresses: string[];
  activeAddress: string | null;
  walletNames: Record<string, string>;
  refreshWallets: () => Promise<void>;
  setActiveAddress: (address: string | null) => void;
  setWalletName: (address: string, name: string) => void;
};

export const useWalletStore = create<WalletStore>()(
  persist(
    (set, get) => ({
      addresses: [],
      activeAddress: null,
      walletNames: {},

      refreshWallets: async () => {
        try {
          const result = await invoke<WalletListResult>("wallet_list");
          const addresses = result.addresses ?? [];
          set({ addresses });
          const { activeAddress } = get();
          if (activeAddress && !addresses.includes(activeAddress)) {
            set({ activeAddress: addresses[0] ?? null });
          } else if (!activeAddress && addresses.length > 0) {
            set({ activeAddress: addresses[0] });
          }
        } catch {
          set({ addresses: [], activeAddress: null });
        }
      },

      setActiveAddress: (address) => set({ activeAddress: address }),
      setWalletName: (address, name) =>
        set((s) => ({
          walletNames: { ...s.walletNames, [address]: name.trim() || "" },
        })),
    }),
    { name: "wallet-store", partialize: (s) => ({ walletNames: s.walletNames }) }
  )
);
