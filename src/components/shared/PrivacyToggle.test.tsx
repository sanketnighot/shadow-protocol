import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { PrivacyToggle } from "@/components/shared/PrivacyToggle";
import { useUiStore } from "@/store/useUiStore";

describe("PrivacyToggle", () => {
  beforeEach(() => {
    useUiStore.setState({ privacyModeEnabled: true });
  });

  it("toggles the shared privacy mode state", async () => {
    const user = userEvent.setup();

    render(<PrivacyToggle />);

    expect(screen.getByRole("button", { name: "Private" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Private" }));

    expect(screen.getByRole("button", { name: "Public" })).toBeInTheDocument();
  });
});
