import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { uiStoreDefaults, useUiStore } from "@/store/useUiStore";

function renderApp() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = "#/";
    useUiStore.setState({
      ...uiStoreDefaults,
      notifications: [...uiStoreDefaults.notifications],
      skippedApprovalStrategyIds: [],
    });
    useOnboardingStore.setState({ hasCompletedOnboarding: true });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    window.location.hash = "#/";
  });

  it("renders the dashboard shell on the home route", () => {
    renderApp();

    expect(screen.getByText("SHADOW")).toBeInTheDocument();
    expect(screen.queryByText("Cmd+K")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Agent" })).toBeInTheDocument();
    expect(screen.getByText("Total Portfolio Value")).toBeInTheDocument();
    expect(screen.getByText("Markets calm. Capital ready.")).toBeInTheDocument();
  });

  it("renders the agent workspace on the agent route", () => {
    window.location.hash = "#/agent";

    renderApp();

    expect(screen.getByText("Agent Copilot")).toBeInTheDocument();
    expect(screen.getByLabelText("Agent instruction")).toBeInTheDocument();
    expect(
      screen.getAllByText("Find me the best yield for USDC").length,
    ).toBeGreaterThan(0);
  });

  it("renders the automation center route", () => {
    window.location.hash = "#/automation";

    renderApp();

    expect(screen.getByText("Active strategies.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /create new strategy/i }),
    ).toBeInTheDocument();
  });

  it("renders the portfolio route", async () => {
    window.location.hash = "#/portfolio";

    renderApp();

    await vi.waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "No wallet" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Create wallet" }),
      ).toBeInTheDocument();
    });
  });

  it("renders the strategy builder route", () => {
    window.location.hash = "#/strategy";

    renderApp();

    expect(screen.getByText("Strategy builder")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Strategy" })).toBeInTheDocument();
    expect(screen.getByText("Guardrails")).toBeInTheDocument();
  });

  it("renders the market route", () => {
    window.location.hash = "#/market";

    renderApp();

    expect(screen.getByRole("heading", { name: "Live opportunities across yield, arbitrage, and rebalancing." })).toBeInTheDocument();
    expect(screen.getByText("Live opportunities across yield, arbitrage, and rebalancing.")).toBeInTheDocument();
  });

  it("renders the settings route", () => {
    window.location.hash = "#/settings";

    renderApp();

    expect(screen.getByRole("heading", { name: "Configuration & Security" })).toBeInTheDocument();
    expect(screen.getByText("Theme")).toBeInTheDocument();
  });

  it("opens the approval modal from the agent flow", async () => {
    window.location.hash = "#/agent";
    const user = userEvent.setup();

    renderApp();

    await user.click(screen.getByRole("button", { name: "Deploy $500" }));

    expect(screen.getByText("Approve transaction")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });
});
