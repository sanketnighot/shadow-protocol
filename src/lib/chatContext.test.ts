import { describe, expect, it } from "vitest";

import type { AgentMessage } from "@/data/mock";
import {
  buildChatMessages,
  DEFAULT_SYSTEM_PROMPT,
  estimateTokens,
  messagesToChat,
  needsSummary,
  resolveContextBudget,
} from "@/lib/chatContext";
import { DEFAULT_CONTEXT_TOKENS } from "@/lib/modelOptions";

function msg(id: string, role: "user" | "agent", content: string): AgentMessage {
  return { id, role, blocks: [{ type: "text", content }] };
}

describe("chatContext", () => {
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
});
