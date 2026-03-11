import { cleanup, render, screen } from "@testing-library/react";
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
});
