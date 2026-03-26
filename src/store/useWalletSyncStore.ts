import { useEffect } from "react";
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { useUiStore } from "@/store/useUiStore";

export type SyncStatus = "idle" | "syncing";

export type WalletSyncState = {
  syncStatus: SyncStatus;
  progress: number;
  currentStep: string;
  walletCount: number;
  walletIndex: number;
  /** Tracks how many wallets have finished; when equals walletCount, we set idle */
  doneCount: number;
};

type SyncProgressPayload = {
  address: string;
  step: string;
  progress: number;
  total: number;
  walletIndex: number;
  walletCount: number;
};

type WalletSyncStore = WalletSyncState & {
  setSyncing: (progress: number, step: string, walletIndex: number, walletCount: number) => void;
  onWalletDone: (walletCount: number) => void;
  setIdle: () => void;
  startSync: (addresses?: string[]) => Promise<void>;
};

const INITIAL: WalletSyncState = {
  syncStatus: "idle",
  progress: 0,
  currentStep: "",
  walletCount: 0,
  walletIndex: 0,
  doneCount: 0,
};

export const useWalletSyncStore = create<WalletSyncStore>((set) => ({
  ...INITIAL,
  setSyncing: (progress, step, walletIndex, walletCount) =>
    set({
      syncStatus: "syncing",
      progress,
      currentStep: step,
      walletIndex,
      walletCount,
    }),
  onWalletDone: (walletCount) =>
    set((s) => {
      const next = s.doneCount + 1;
      if (next >= walletCount) {
        return INITIAL;
      }
      return { ...s, doneCount: next };
    }),
  setIdle: () => set(INITIAL),
  startSync: async (addresses?: string[]) => {
    try {
      await invoke<{ started: boolean; count: number }>("wallet_sync_start", {
        addresses: addresses ?? null,
      });
    } catch {
      // Ignore; sync may already be running
    }
  },
}));

export function useTxConfirmationListener(): void {
  const addNotification = useUiStore((s) => s.addNotification);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }
    const unsub = listen<{ txHash: string; status: string; error?: string }>(
      "tx_confirmation",
      (event) => {
        const p = event.payload;
        if (p.status === "confirmed") {
          addNotification({
            title: "Transfer confirmed",
            description: p.txHash ? `Tx ${p.txHash.slice(0, 10)}…${p.txHash.slice(-8)}` : "Transaction confirmed",
            type: "success",
            createdAtLabel: "Just now",
            route: "/portfolio",
          });
        } else if (p.status === "failed") {
          addNotification({
            title: "Transfer failed",
            description: p.error ?? "Transaction failed",
            type: "warning",
            createdAtLabel: "Just now",
            route: "/portfolio",
          });
        }
      },
    );
    return () => {
      unsub.then((fn) => fn());
    };
  }, [addNotification]);
}

export function useWalletSyncListeners(): void {
  const setSyncing = useWalletSyncStore((s) => s.setSyncing);
  const onWalletDone = useWalletSyncStore((s) => s.onWalletDone);
  const addNotification = useUiStore((s) => s.addNotification);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }
    const unsubProgress = listen<SyncProgressPayload>(
      "wallet_sync_progress",
      (event) => {
        const p = event.payload;
        setSyncing(p.progress ?? 0, p.step ?? "", p.walletIndex ?? 0, p.walletCount ?? 1);
      },
    );

    const unsubDone = listen<{ address: string; success: boolean; error?: string }>(
      "wallet_sync_done",
      (event) => {
        const state = useWalletSyncStore.getState();
        const count = Math.max(1, state.walletCount);
        const isLast = state.doneCount + 1 >= count;
        onWalletDone(count);
        if (event.payload.success && isLast) {
          addNotification({
            title: "Portfolio synced",
            description: "Cross-chain balances refreshed.",
            type: "info",
            createdAtLabel: "Just now",
            route: "/portfolio",
          });
        }
      },
    );

    return () => {
      unsubProgress.then((fn) => fn());
      unsubDone.then((fn) => fn());
    };
  }, [setSyncing, onWalletDone, addNotification]);
}

type ShadowAlertPayload = {
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  asset?: string;
  suggestion?: string;
  payload?: any;
};

export function useShadowAlertListener(): void {
  const addNotification = useUiStore((s) => s.addNotification);
  const openPanicModal = useUiStore((s) => s.openPanicModal);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }
    const unsub = listen<ShadowAlertPayload>("shadow_alert", (event) => {
      const p = event.payload;
      
      if (p.severity === "critical") {
        openPanicModal({
          totalValueAtRisk: "$12,450.00",
          routes: [
            { fromToken: p.asset || "ETH", toToken: "USDC", chain: "Base", estimatedGasUsd: "$1.50" }
          ]
        });
      } else {
        addNotification({
          title: String(p.title),
          description: `${p.message}${p.suggestion ? ` Suggestion: ${p.suggestion}` : ""}`,
          type: p.severity === "warning" ? "warning" : "info",
          createdAtLabel: "Just now",
          route: "/agent",
          payload: p.payload,
          toolName: p.payload ? "execute_token_swap" : undefined,
        });
      }
    });

    return () => {
      unsub.then((fn) => fn());
    };
  }, [addNotification, openPanicModal]);
}
