import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentMessage } from "@/data/mock";
import { useAgentThreadStore, type Thread } from "@/store/useAgentThreadStore";
import { useOllamaStore } from "@/store/useOllamaStore";
import { useWalletStore } from "@/store/useWalletStore";

const chatAgentMock = vi.fn();

vi.mock("@/lib/agent", () => ({
  chatAgent: (...args: unknown[]) => chatAgentMock(...args),
}));

function msg(id: string, role: "user" | "agent", content: string): AgentMessage {
  return { id, role, blocks: [{ type: "text", content }] };
}

describe("useAgentThreadStore sendMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof localStorage !== "undefined") localStorage.clear();
    useOllamaStore.setState({ selectedModel: "llama3.2:3b" });
    useWalletStore.setState({ activeAddress: "0x1234567890123456789012345678901234567890" });
    chatAgentMock.mockResolvedValue({
      kind: "assistantMessage",
      content: "Agent reply",
      blocks: [{ type: "text", content: "Agent reply" }],
    });
  });

  it("builds chat request with full context, not just latest message", async () => {
    const thread: Thread = {
      id: "thread-1",
      title: "Test",
      messages: [
        msg("u1", "user", "First question"),
        msg("a1", "agent", "First answer"),
        msg("u2", "user", "Second question"),
      ],
      rollingSummary: null,
      isStreaming: false,
      latestActivityLabel: "",
      suggestion: { title: "", summary: "", actionLabel: "" },
      pendingApproval: null,
      pendingAgentAction: null,
      createdAt: 0,
      updatedAt: 0,
    };
    useAgentThreadStore.setState({
      threads: [thread],
      activeThreadId: thread.id,
    });

    useAgentThreadStore.getState().sendMessage(thread.id, "Third question");

    await vi.waitFor(() => expect(chatAgentMock).toHaveBeenCalled());

    const call = chatAgentMock.mock.calls[0][0];
    expect(call.model).toBe("llama3.2:3b");
    expect(call.messages).toBeDefined();
    expect(Array.isArray(call.messages)).toBe(true);
    expect(call.messages.length).toBeGreaterThanOrEqual(3);
    const userContents = call.messages
      .filter((m: { role: string }) => m.role === "user")
      .map((m: { content: string }) => m.content);
    expect(userContents).toContain("First question");
    expect(userContents).toContain("Second question");
    expect(userContents).toContain("Third question");
  });
});
