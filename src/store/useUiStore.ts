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
  /** Optional execution payload for actionable signals. */
  payload?: any;
  /** The tool name associated with the payload. */
  toolName?: string;
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
  activeSignalPayload: any | null;
  activeSignalToolName: string | null;
  isPanicModalOpen: boolean;
  panicRouteData: any | null;
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
  openSignalApproval: (toolName: string, payload: any) => void;
  openPanicModal: (data: any) => void;
  closePanicModal: () => void;
};

const INITIAL_NOTIFICATIONS: NotificationItem[] = [];

const DEFAULT_STATE = {
  privacyModeEnabled: true,
  /** On in `vite`/Tauri dev; off in production builds. Persisted value still wins after first save. */
  developerModeEnabled: import.meta.env.DEV,
  isSidebarOpen: false,
  pendingApprovalId: null,
  themePreference: "dark" as ThemePreference,
  isCommandPaletteOpen: false,
  portfolioAction: null as PortfolioActionState | null,
  skippedApprovalStrategyIds: [] as string[],
  notifications: INITIAL_NOTIFICATIONS,
  lastAddedNotificationId: null as string | null,
  activeSignalPayload: null,
  activeSignalToolName: null,
  isPanicModalOpen: false,
  panicRouteData: null,
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
      clearPendingApproval: () => set({ pendingApprovalId: null, activeSignalPayload: null, activeSignalToolName: null }),
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
      openSignalApproval: (toolName, payload) => set({ activeSignalToolName: toolName, activeSignalPayload: payload, pendingApprovalId: "signal-action" }),
      openPanicModal: (data) => set({ isPanicModalOpen: true, panicRouteData: data }),
      closePanicModal: () => set({ isPanicModalOpen: false, panicRouteData: null }),
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
