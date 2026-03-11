import { create } from "zustand";

type UiStore = {
  privacyModeEnabled: boolean;
  isSidebarOpen: boolean;
  pendingApprovalId: string | null;
  togglePrivacyMode: () => void;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
  setPendingApproval: (approvalId: string) => void;
  clearPendingApproval: () => void;
};

export const useUiStore = create<UiStore>((set) => ({
  privacyModeEnabled: true,
  isSidebarOpen: false,
  pendingApprovalId: null,
  togglePrivacyMode: () =>
    set((state) => ({ privacyModeEnabled: !state.privacyModeEnabled })),
  openSidebar: () => set({ isSidebarOpen: true }),
  closeSidebar: () => set({ isSidebarOpen: false }),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setPendingApproval: (approvalId) => set({ pendingApprovalId: approvalId }),
  clearPendingApproval: () => set({ pendingApprovalId: null }),
}));
