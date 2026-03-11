import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemePreference = "dark" | "light" | "system";
export type PortfolioActionType = "send" | "swap" | "bridge";
export type NotificationType = "info" | "success" | "warning";

export type NotificationItem = {
  id: string;
  title: string;
  description: string;
  type: NotificationType;
  createdAtLabel: string;
  unread: boolean;
};

type PortfolioActionState = {
  action: PortfolioActionType;
  assetId: string;
};

type UiStore = {
  privacyModeEnabled: boolean;
  isSidebarOpen: boolean;
  pendingApprovalId: string | null;
  themePreference: ThemePreference;
  isCommandPaletteOpen: boolean;
  isNotificationsOpen: boolean;
  portfolioAction: PortfolioActionState | null;
  skippedApprovalStrategyIds: string[];
  notifications: NotificationItem[];
  togglePrivacyMode: () => void;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
  setPendingApproval: (approvalId: string) => void;
  clearPendingApproval: () => void;
  setThemePreference: (themePreference: ThemePreference) => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleNotifications: () => void;
  closeNotifications: () => void;
  openPortfolioAction: (action: PortfolioActionType, assetId: string) => void;
  closePortfolioAction: () => void;
  setSkipApprovalForStrategy: (strategyId: string, enabled: boolean) => void;
  addNotification: (notification: Omit<NotificationItem, "id" | "unread">) => void;
  markNotificationsRead: () => void;
};

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "notif-1",
    title: "Strategy executed",
    description: "Weekly DCA bought 0.01 ETH and stayed inside your guardrails.",
    type: "success",
    createdAtLabel: "2m ago",
    unread: true,
  },
  {
    id: "notif-2",
    title: "Approval required",
    description: "Arbitrage Hunter found a new route on Base waiting for review.",
    type: "warning",
    createdAtLabel: "10m ago",
    unread: true,
  },
  {
    id: "notif-3",
    title: "Portfolio synced",
    description: "Cross-chain balances refreshed across Ethereum, Arbitrum, Base, and Solana.",
    type: "info",
    createdAtLabel: "24m ago",
    unread: false,
  },
];

const DEFAULT_STATE = {
  privacyModeEnabled: true,
  isSidebarOpen: false,
  pendingApprovalId: null,
  themePreference: "dark" as ThemePreference,
  isCommandPaletteOpen: false,
  isNotificationsOpen: false,
  portfolioAction: null as PortfolioActionState | null,
  skippedApprovalStrategyIds: [] as string[],
  notifications: INITIAL_NOTIFICATIONS,
};

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,
      togglePrivacyMode: () =>
        set((state) => ({ privacyModeEnabled: !state.privacyModeEnabled })),
      openSidebar: () => set({ isSidebarOpen: true }),
      closeSidebar: () => set({ isSidebarOpen: false }),
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setPendingApproval: (approvalId) => set({ pendingApprovalId: approvalId }),
      clearPendingApproval: () => set({ pendingApprovalId: null }),
      setThemePreference: (themePreference) => set({ themePreference }),
      openCommandPalette: () => set({ isCommandPaletteOpen: true }),
      closeCommandPalette: () => set({ isCommandPaletteOpen: false }),
      toggleNotifications: () =>
        set((state) => ({ isNotificationsOpen: !state.isNotificationsOpen })),
      closeNotifications: () => set({ isNotificationsOpen: false }),
      openPortfolioAction: (action, assetId) =>
        set({ portfolioAction: { action, assetId } }),
      closePortfolioAction: () => set({ portfolioAction: null }),
      setSkipApprovalForStrategy: (strategyId, enabled) =>
        set((state) => ({
          skippedApprovalStrategyIds: enabled
            ? [...new Set([...state.skippedApprovalStrategyIds, strategyId])]
            : state.skippedApprovalStrategyIds.filter((id) => id !== strategyId),
        })),
      addNotification: (notification) =>
        set((state) => ({
          notifications: [
            {
              ...notification,
              id: `notif-${crypto.randomUUID()}`,
              unread: true,
            },
            ...state.notifications,
          ],
        })),
      markNotificationsRead: () =>
        set((state) => ({
          notifications: state.notifications.map((notification) => ({
            ...notification,
            unread: false,
          })),
        })),
    }),
    {
      name: "shadow-ui-store",
      partialize: (state) => ({
        privacyModeEnabled: state.privacyModeEnabled,
        themePreference: state.themePreference,
        skippedApprovalStrategyIds: state.skippedApprovalStrategyIds,
        notifications: state.notifications,
      }),
    },
  ),
);

export const uiStoreDefaults = DEFAULT_STATE;
