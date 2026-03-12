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
  /** Route to open in main content when the notification is clicked (e.g. /automation, /agent). */
  route?: string;
};

type PortfolioActionState = {
  action: PortfolioActionType;
  assetId: string;
};

type UiStore = {
  privacyModeEnabled: boolean;
  developerModeEnabled: boolean;
  isSidebarOpen: boolean;
  pendingApprovalId: string | null;
  themePreference: ThemePreference;
  isCommandPaletteOpen: boolean;
  portfolioAction: PortfolioActionState | null;
  skippedApprovalStrategyIds: string[];
  notifications: NotificationItem[];
  lastAddedNotificationId: string | null;
  togglePrivacyMode: () => void;
  toggleDeveloperMode: () => void;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
  setPendingApproval: (approvalId: string) => void;
  clearPendingApproval: () => void;
  setThemePreference: (themePreference: ThemePreference) => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  openPortfolioAction: (action: PortfolioActionType, assetId: string) => void;
  closePortfolioAction: () => void;
  setSkipApprovalForStrategy: (strategyId: string, enabled: boolean) => void;
  addNotification: (notification: Omit<NotificationItem, "id" | "unread">) => void;
  markNotificationRead: (id: string) => void;
  markNotificationsRead: () => void;
  archiveNotification: (id: string) => void;
  archiveAllNotifications: () => void;
  clearLastAddedNotification: () => void;
};

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "notif-1",
    title: "Strategy executed",
    description: "Weekly DCA bought 0.01 ETH and stayed inside your guardrails.",
    type: "success",
    createdAtLabel: "2m ago",
    unread: true,
    route: "/automation",
  },
  {
    id: "notif-2",
    title: "Approval required",
    description: "Arbitrage Hunter found a new route on Base waiting for review.",
    type: "warning",
    createdAtLabel: "10m ago",
    unread: true,
    route: "/agent",
  },
  {
    id: "notif-3",
    title: "Portfolio synced",
    description: "Cross-chain balances refreshed across Ethereum, Arbitrum, Base, and Solana.",
    type: "info",
    createdAtLabel: "24m ago",
    unread: false,
    route: "/portfolio",
  },
];

const DEFAULT_STATE = {
  privacyModeEnabled: true,
  developerModeEnabled: false,
  isSidebarOpen: false,
  pendingApprovalId: null,
  themePreference: "dark" as ThemePreference,
  isCommandPaletteOpen: false,
  portfolioAction: null as PortfolioActionState | null,
  skippedApprovalStrategyIds: [] as string[],
  notifications: INITIAL_NOTIFICATIONS,
  lastAddedNotificationId: null as string | null,
};

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,
      togglePrivacyMode: () =>
        set((state) => ({ privacyModeEnabled: !state.privacyModeEnabled })),
      toggleDeveloperMode: () =>
        set((state) => ({ developerModeEnabled: !state.developerModeEnabled })),
      openSidebar: () => set({ isSidebarOpen: true }),
      closeSidebar: () => set({ isSidebarOpen: false }),
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setPendingApproval: (approvalId) => set({ pendingApprovalId: approvalId }),
      clearPendingApproval: () => set({ pendingApprovalId: null }),
      setThemePreference: (themePreference) => set({ themePreference }),
      openCommandPalette: () => set({ isCommandPaletteOpen: true }),
      closeCommandPalette: () => set({ isCommandPaletteOpen: false }),
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
        set((state) => {
          const id = `notif-${crypto.randomUUID()}`;
          return {
            notifications: [
              { ...notification, id, unread: true },
              ...state.notifications,
            ],
            lastAddedNotificationId: id,
          };
        }),
      markNotificationRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, unread: false } : n,
          ),
        })),
      markNotificationsRead: () =>
        set((state) => ({
          notifications: state.notifications.map((notification) => ({
            ...notification,
            unread: false,
          })),
        })),
      archiveNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),
      archiveAllNotifications: () =>
        set({ notifications: [], lastAddedNotificationId: null }),
      clearLastAddedNotification: () =>
        set({ lastAddedNotificationId: null }),
    }),
    {
      name: "shadow-ui-store",
      partialize: (state) => ({
        privacyModeEnabled: state.privacyModeEnabled,
        developerModeEnabled: state.developerModeEnabled,
        themePreference: state.themePreference,
        skippedApprovalStrategyIds: state.skippedApprovalStrategyIds,
        notifications: state.notifications,
      }),
    },
  ),
);

export const uiStoreDefaults = DEFAULT_STATE;
