import type { AgentMessage } from "@/data/mock";
import { chat, type OllamaChatMessage } from "@/lib/ollama";
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

const SUMMARY_SYSTEM_PROMPT =
  "Summarize this conversation concisely. Preserve key facts, decisions, and context. Output only the summary, no preamble.";

/**
 * Generate a rolling summary of the given older messages using the selected model.
 * Returns empty string on failure (caller should degrade to system + latest 10).
 */
export async function generateRollingSummary(
  olderMessages: AgentMessage[],
  model: string,
): Promise<string> {
  if (olderMessages.length === 0) return "";
  const transcript = olderMessages
    .map((m) => {
      const role = m.role === "user" ? "User" : "Assistant";
      const text = getMessageText(m);
      return `${role}: ${text}`;
    })
    .join("\n\n");
  try {
    const summary = await chat({
      model,
      messages: [
        { role: "system" as const, content: SUMMARY_SYSTEM_PROMPT },
        { role: "user" as const, content: `Conversation to summarize:\n\n${transcript}` },
      ],
      stream: false,
    });
    return (summary ?? "").trim();
  } catch {
    return "";
  }
}
