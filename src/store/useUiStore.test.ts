import { beforeEach, describe, expect, it } from "vitest";

import { uiStoreDefaults, useUiStore } from "@/store/useUiStore";

describe("useUiStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useUiStore.setState({
      ...uiStoreDefaults,
      notifications: [...uiStoreDefaults.notifications],
      archivedNotifications: [...uiStoreDefaults.archivedNotifications],
      skippedApprovalStrategyIds: [],
    });
  });

  it("toggles the sidebar state", () => {
    useUiStore.getState().openSidebar();
    expect(useUiStore.getState().isSidebarOpen).toBe(true);

    useUiStore.getState().closeSidebar();
    expect(useUiStore.getState().isSidebarOpen).toBe(false);
  });

  it("stores the pending approval id", () => {
    useUiStore.getState().setPendingApproval("approval-1");
    expect(useUiStore.getState().pendingApprovalId).toBe("approval-1");

    useUiStore.getState().clearPendingApproval();
    expect(useUiStore.getState().pendingApprovalId).toBeNull();
  });

  it("updates the theme preference", () => {
    useUiStore.getState().setThemePreference("light");
    expect(useUiStore.getState().themePreference).toBe("light");
  });

  it("stores skipped approvals for a strategy", () => {
    useUiStore.getState().setSkipApprovalForStrategy("weekly-dca", true);
    expect(useUiStore.getState().skippedApprovalStrategyIds).toContain("weekly-dca");
  });
});
