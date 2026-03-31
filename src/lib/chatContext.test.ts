import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentMessage } from "@/data/mock";
const summarizeAgentConversationMock = vi.fn();

vi.mock("@/lib/agent", () => ({
  summarizeAgentConversation: (...args: unknown[]) =>
    summarizeAgentConversationMock(...args),
}));
import {
  buildChatMessages,
  DEFAULT_SYSTEM_PROMPT,
  estimateTokens,
  extractStructuredFacts,
  generateRollingSummary,
  mergeStructuredFacts,
  messagesToChat,
  needsSummary,
  resolveContextBudget,
  selectAgentMessages,
} from "@/lib/chatContext";
import { DEFAULT_CONTEXT_TOKENS } from "@/lib/modelOptions";

function msg(id: string, role: "user" | "agent", content: string): AgentMessage {
  return { id, role, blocks: [{ type: "text", content }] };
}

describe("chatContext", () => {
  beforeEach(() => {
    summarizeAgentConversationMock.mockReset();
    summarizeAgentConversationMock.mockResolvedValue("mock summary");
  });

  describe("estimateTokens", () => {
    it("estimates ~4 chars per token", () => {
      expect(estimateTokens("")).toBe(0);
      expect(estimateTokens("abcd")).toBe(1);
      expect(estimateTokens("a".repeat(400))).toBe(100);
    });
  });

  describe("resolveContextBudget", () => {
    it("returns known model context", () => {
      expect(resolveContextBudget("llama3.2:3b")).toBe(8192);
    });
    it("returns default for unknown model", () => {
      expect(resolveContextBudget("custom-model:latest")).toBe(DEFAULT_CONTEXT_TOKENS);
    });
  });

  describe("messagesToChat", () => {
    it("maps user/agent to user/assistant", () => {
      const msgs = [msg("u1", "user", "hi"), msg("a1", "agent", "hello")];
      expect(messagesToChat(msgs)).toEqual([
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ]);
    });
    it("excludes Thinking placeholder when excludePlaceholder is true", () => {
      const msgs = [
        msg("u1", "user", "hi"),
        msg("a1", "agent", "Thinking…"),
      ];
      expect(messagesToChat(msgs)).toEqual([{ role: "user", content: "hi" }]);
    });
  });

  describe("needsSummary", () => {
    it("returns false for short threads", () => {
      const msgs = [msg("u1", "user", "hi"), msg("a1", "agent", "hey")];
      expect(needsSummary(msgs, 8192)).toBe(false);
    });
    it("returns true when older exceeds remaining budget", () => {
      const msgs = Array.from({ length: 15 }, (_, i) =>
        msg(`m${i}`, i % 2 === 0 ? "user" : "agent", "x".repeat(500)),
      );
      expect(needsSummary(msgs, 1000)).toBe(true);
    });
  });

  describe("buildChatMessages", () => {
    it("includes system prompt and all messages for short threads", () => {
      const msgs = [msg("u1", "user", "hi"), msg("a1", "agent", "hello")];
      const built = buildChatMessages({
        messages: msgs,
        rollingSummary: null,
        contextBudget: 8192,
      });
      expect(built[0]).toEqual({ role: "system", content: DEFAULT_SYSTEM_PROMPT });
      expect(built.slice(1)).toEqual([
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ]);
    });

    it("includes rolling summary in system when provided and older does not fit", () => {
      const msgs = Array.from({ length: 12 }, (_, i) =>
        msg(`m${i}`, i % 2 === 0 ? "user" : "agent", "long message ".repeat(100)),
      );
      const summary = "Prior discussion about yields.";
      const built = buildChatMessages({
        messages: msgs,
        rollingSummary: summary,
        contextBudget: 2000,
      });
      expect(built[0].role).toBe("system");
      expect(built[0].content).toContain(summary);
      expect(built[0].content).toContain(DEFAULT_SYSTEM_PROMPT);
      expect(built.length).toBeGreaterThan(1);
      expect(built.slice(-2).map((m) => m.role)).toEqual(["user", "assistant"]);
    });

    it("always includes latest 10 messages", () => {
      const msgs = Array.from({ length: 15 }, (_, i) =>
        msg(`m${i}`, i % 2 === 0 ? "user" : "agent", `msg ${i}`),
      );
      const built = buildChatMessages({
        messages: msgs,
        rollingSummary: null,
        contextBudget: 8192,
      });
      const latestContent = built.slice(-10).map((m) => m.content);
      expect(latestContent).toEqual(
        Array.from({ length: 10 }, (_, i) => `msg ${5 + i}`),
      );
    });
  });

  describe("selectAgentMessages", () => {
    it("returns the latest messages when a rolling summary exists", () => {
      const msgs = Array.from({ length: 14 }, (_, i) =>
        msg(`m${i}`, i % 2 === 0 ? "user" : "agent", `msg ${i}`),
      );

      expect(selectAgentMessages(msgs, "Earlier context", 4)).toEqual([
        { role: "user", content: "msg 10" },
        { role: "assistant", content: "msg 11" },
        { role: "user", content: "msg 12" },
        { role: "assistant", content: "msg 13" },
      ]);
    });

    it("returns the full thread when no rolling summary exists", () => {
      const msgs = [
        msg("u1", "user", "First question"),
        msg("a1", "agent", "First answer"),
        msg("u2", "user", "Second question"),
      ];

      expect(selectAgentMessages(msgs, null, 4)).toEqual([
        { role: "user", content: "First question" },
        { role: "assistant", content: "First answer" },
        { role: "user", content: "Second question" },
      ]);
    });
  });

  describe("extractStructuredFacts", () => {
    it("extracts portfolio facts from get_total_portfolio_value", () => {
      const content = JSON.stringify({
        totalUsd: "$1,234.56",
        walletCount: 2,
        breakdown: [
          { token: "ETH", amount: "0.5", value: "$800", chains: "Ethereum" },
          { token: "USDC", amount: "434", value: "$434.56", chains: "Base" },
        ],
      });
      const facts = extractStructuredFacts("get_total_portfolio_value", content);
      expect(facts).toContain("Portfolio total: $1,234.56 across 2 wallet(s)");
      expect(facts).toContain("ETH: 0.5 ($800)");
      expect(facts).toContain("USDC: 434 ($434.56)");
      expect(facts).toContain("on Ethereum");
      expect(facts).toContain("on Base");
    });

    it("extracts price facts from get_token_price", () => {
      const content = JSON.stringify({ priceUsd: 3420.5 });
      const facts = extractStructuredFacts("get_token_price", content);
      expect(facts).toContain("Token price: $3420.5");
    });

    it("returns empty for invalid JSON", () => {
      expect(extractStructuredFacts("get_total_portfolio_value", "not json")).toBe("");
    });
  });

  describe("mergeStructuredFacts", () => {
    it("merges new facts into existing", () => {
      const existing = "Portfolio total: $100";
      const newFacts = "ETH price: $3400";
      expect(mergeStructuredFacts(existing, newFacts)).toContain("$100");
      expect(mergeStructuredFacts(existing, newFacts)).toContain("$3400");
    });

    it("returns existing when new facts are empty", () => {
      expect(mergeStructuredFacts("prior", "")).toBe("prior");
      expect(mergeStructuredFacts("prior", "   ")).toBe("prior");
    });
  });

  describe("generateRollingSummary", () => {
    it("delegates summary generation through the backend bridge", async () => {
      const summary = await generateRollingSummary(
        [
          msg("u1", "user", "How should I rebalance?"),
          msg("a1", "agent", "Start with your ETH concentration."),
        ],
        "llama3.2:3b",
      );

      expect(summary).toBe("mock summary");
    });
  });
});
