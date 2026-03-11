import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import App from "./App";

describe("App", () => {
  beforeEach(() => {
    window.location.hash = "#/";
  });

  afterEach(() => {
    cleanup();
    window.location.hash = "#/";
  });

  it("renders the dashboard shell on the home route", () => {
    render(<App />);

    expect(screen.getByText("SHADOW Protocol")).toBeInTheDocument();
    expect(screen.getByText("Live operations")).toBeInTheDocument();
    expect(screen.queryByText("Cmd+K")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Agent" })).toBeInTheDocument();
    expect(screen.getByText("Total Portfolio Value")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
    expect(screen.getByText("AI agent status")).toBeInTheDocument();
  });

  it("renders the agent workspace on the agent route", () => {
    window.location.hash = "#/agent";

    render(<App />);

    expect(screen.getByText("Agent conversation")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Type your instruction..."),
    ).toBeInTheDocument();
    expect(screen.getByText("Aave V3 on Arbitrum")).toBeInTheDocument();
  });

  it("renders the automation center route", () => {
    window.location.hash = "#/automation";

    render(<App />);

    expect(screen.getByText("Active strategies")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /create new strategy/i }),
    ).toBeInTheDocument();
  });

  it("renders the portfolio route", () => {
    window.location.hash = "#/portfolio";

    render(<App />);

    expect(screen.getByText("All assets")).toBeInTheDocument();
    expect(screen.getByLabelText("Chain filter")).toBeInTheDocument();
    expect(screen.getByLabelText("Sort assets")).toBeInTheDocument();
  });

  it("renders the strategy builder route", () => {
    window.location.hash = "#/strategy";

    render(<App />);

    expect(screen.getByText("Strategy builder")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Strategy" })).toBeInTheDocument();
    expect(screen.getByText("Guardrails")).toBeInTheDocument();
  });

  it("opens the approval modal from the agent flow", async () => {
    window.location.hash = "#/agent";
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Deploy $500" }));

    expect(screen.getByText("Approve transaction")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });
});
