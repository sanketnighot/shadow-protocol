import { beforeEach, describe, expect, it } from "vitest";

import { useUiStore } from "@/store/useUiStore";

describe("useUiStore", () => {
  beforeEach(() => {
    useUiStore.setState({
      privacyModeEnabled: true,
      isSidebarOpen: false,
      pendingApprovalId: null,
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
});
