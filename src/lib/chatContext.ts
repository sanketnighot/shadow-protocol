import type { AgentMessage } from "@/data/mock";
import { summarizeAgentConversation } from "@/lib/agent";
import type { OllamaChatMessage } from "@/lib/ollama";
import { getContextBudget } from "@/lib/modelOptions";

/** System prompt for the chat agent. Single source of truth. */
export const DEFAULT_SYSTEM_PROMPT = `You are a helpful DeFi and crypto assistant. Be concise, accurate, and focused on the user's questions about yield, strategies, markets, and portfolio management.`;

/** Conservative estimate: ~4 characters per token. */
const CHARS_PER_TOKEN = 4;

/** Estimate token count from text. */
export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / CHARS_PER_TOKEN);
}

/** Extract plain text from an agent message (text blocks only). */
function getMessageText(msg: AgentMessage): string {
  return msg.blocks
    .filter((b): b is { type: "text"; content: string } => b.type === "text")
    .map((b) => b.content)
    .join("\n");
}

/** Map AgentMessage to Ollama role. */
function toOllamaRole(role: "user" | "agent"): "user" | "assistant" {
  return role === "agent" ? "assistant" : "user";
}

/** Convert thread messages to Ollama chat messages. */
export function messagesToChat(
  messages: AgentMessage[],
  excludePlaceholder = true,
): OllamaChatMessage[] {
  const filtered = excludePlaceholder
    ? messages.filter((m) => {
        if (m.role !== "agent") return true;
        const text = getMessageText(m);
        return text !== "Thinking…";
      })
    : messages;
  return filtered.map((m) => ({
    role: toOllamaRole(m.role),
    content: getMessageText(m),
  }));
}

export type BuildChatMessagesParams = {
  messages: AgentMessage[];
  rollingSummary: string | null;
  contextBudget: number;
  systemPrompt?: string;
  latestN?: number;
};

/**
 * Build the messages array for Ollama chat.
 * Always includes: system prompt + (older history or summary) + latest N messages.
 */
export function buildChatMessages(params: BuildChatMessagesParams): OllamaChatMessage[] {
  const {
    messages,
    rollingSummary,
    contextBudget,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    latestN = 10,
  } = params;

  const chatMessages = messagesToChat(messages);
  if (chatMessages.length === 0) return [];

  const latest = chatMessages.slice(-latestN);
  const older = chatMessages.slice(0, -latestN);
  const latestTokens = latest.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const olderTokens = older.reduce((sum, m) => sum + estimateTokens(m.content), 0);

  const useRawOlder = older.length === 0 || olderTokens <= contextBudget - estimateTokens(systemPrompt) - latestTokens;
  const useSummary = !useRawOlder && !!rollingSummary;

  const systemContent = useSummary
    ? `${systemPrompt}\n\nPrevious conversation summary:\n${rollingSummary}`
    : systemPrompt;

  const result: OllamaChatMessage[] = [{ role: "system", content: systemContent }];
  if (useRawOlder) {
    result.push(...older, ...latest);
  } else {
    result.push(...latest);
  }
  return result;
}

/**
 * Select the conversation window to send to the Rust-side AI kernel.
 * When a rolling summary exists, only the recent messages are sent and Rust
 * reconstructs the full context from summary + facts + recent turns.
 */
export function selectAgentMessages(
  messages: AgentMessage[],
  rollingSummary: string | null,
  latestN = 10,
): OllamaChatMessage[] {
  const chatMessages = messagesToChat(messages);
  if (!rollingSummary?.trim()) {
    return chatMessages;
  }
  return chatMessages.slice(-latestN);
}

/** Get context budget for the selected model. */
export function resolveContextBudget(modelId: string): number {
  return getContextBudget(modelId);
}

/**
 * Returns true if older messages (before the latest N) exceed remaining context budget
 * and would require a summary to fit.
 */
export function needsSummary(
  messages: AgentMessage[],
  contextBudget: number,
  latestN = 10,
): boolean {
  const msgs = messagesToChat(messages);
  if (msgs.length <= latestN) return false;
  const systemTokens = estimateTokens(DEFAULT_SYSTEM_PROMPT);
  const latest = msgs.slice(-latestN);
  const latestTokens = latest.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const remaining = Math.max(0, contextBudget - systemTokens - latestTokens);
  const older = msgs.slice(0, -latestN);
  const olderTokens = older.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  return olderTokens > remaining;
}

const STRUCTURED_FACTS_MAX_CHARS = 600;

/**
 * Extract compact structured facts from a tool result for inclusion in future agent context.
 * Used for follow-ups like "analyze it", "compare with ETH", "is that concentrated?".
 */
export function extractStructuredFacts(toolName: string, content: string): string {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const lines: string[] = [];

    if (toolName === "get_total_portfolio_value") {
      const data = (parsed.Ok as Record<string, unknown>) ?? parsed;
      const total = data.totalUsd ?? "0";
      const walletCount = data.walletCount ?? 0;
      lines.push(`Portfolio total: ${total} across ${walletCount} wallet(s).`);
      const breakdown = Array.isArray(data.breakdown) ? data.breakdown : [];
      for (const item of breakdown.slice(0, 8)) {
        const obj = item as Record<string, unknown>;
        const token = obj.token ?? "?";
        const amount = obj.amount ?? "0";
        const value = obj.value ?? "0";
        const chains = obj.chains ?? "";
        lines.push(`  ${token}: ${amount} (${value})${chains ? ` on ${chains}` : ""}`);
      }
    } else if (toolName === "get_wallet_balances") {
      const items = Array.isArray(parsed) ? parsed : [];
      for (const item of items.slice(0, 6)) {
        const obj = item as Record<string, unknown>;
        lines.push(
          `  ${obj.token ?? "?"} on ${obj.chain ?? "?"}: ${obj.amount ?? "0"} (${obj.valueUsd ?? "0"})`,
        );
      }
    } else if (toolName === "get_token_price") {
      const price = parsed.priceUsd ?? 0;
      lines.push(`Token price: $${price}`);
    }
    return lines.length > 0 ? lines.join("\n") : "";
  } catch {
    return "";
  }
}

/**
 * Merge new facts into existing structured facts, capping total size.
 */
export function mergeStructuredFacts(existing: string | null, newFacts: string): string {
  if (!newFacts.trim()) return existing ?? "";
  const withNew = existing ? `${existing}\n\n${newFacts}` : newFacts;
  if (withNew.length <= STRUCTURED_FACTS_MAX_CHARS) return withNew;
  return withNew.slice(-STRUCTURED_FACTS_MAX_CHARS);
}

/**
 * Generate a rolling summary of the given older messages using the selected model.
 * Returns empty string on failure (caller should degrade to system + latest 10).
 */
export async function generateRollingSummary(
  olderMessages: AgentMessage[],
  model: string,
): Promise<string> {
  if (olderMessages.length === 0) return "";
  try {
    const summary = await summarizeAgentConversation({
      model,
      messages: messagesToChat(olderMessages),
      numCtx: Math.max(2048, Math.min(resolveContextBudget(model), 8192)),
    });
    return (summary ?? "").trim();
  } catch {
    return "";
  }
}
