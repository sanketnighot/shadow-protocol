import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  AGENT_MESSAGES,
  AGENT_SUGGESTION,
  PENDING_APPROVAL_TX,
  type AgentMessage,
  type AgentMessageBlock,
  type AgentSuggestion,
  type ApprovalTransaction,
} from "@/data/mock";
import {
  messagesToChat,
  resolveContextBudget,
} from "@/lib/chatContext";
import { chatAgent } from "@/lib/agent";
import type { SwapPreviewPayload } from "@/types/agent";
import { useOllamaStore } from "@/store/useOllamaStore";
import { useWalletStore } from "@/store/useWalletStore";

export type PendingAgentAction = {
  toolName: string;
  payload: unknown;
};

export type Thread = {
  id: string;
  title: string | null;
  messages: AgentMessage[];
  /** Persisted rolling summary of older messages when context exceeds budget. */
  rollingSummary: string | null;
  isStreaming: boolean;
  latestActivityLabel: string;
  suggestion: AgentSuggestion;
  pendingApproval: ApprovalTransaction | null;
  /** When agent requires approval, stored for approve_agent_action invoke. */
  pendingAgentAction: PendingAgentAction | null;
  createdAt: number;
  updatedAt: number;
};

const EMPTY_APPROVAL: ApprovalTransaction = {
  id: "none",
  strategyId: "",
  action: "",
  amount: "",
  chain: "",
  slippage: "",
  gas: "",
  reason: "",
  executionWindow: "",
};

function deriveTitle(messages: AgentMessage[]): string | null {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return null;
  const block = firstUser.blocks[0];
  if (block?.type !== "text") return null;
  const text = block.content.trim();
  return text.length > 0 ? text.slice(0, 48) + (text.length > 48 ? "…" : "") : null;
}

type AgentThreadStore = {
  threads: Thread[];
  activeThreadId: string | null;
  createThread: () => void;
  setActiveThreadId: (id: string | null) => void;
  sendMessage: (threadId: string, content: string) => void;
  deleteThread: (id: string) => void;
  clearPendingApprovalForThread: (threadId: string) => void;
};

function createEmptyThread(): Thread {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: null,
    messages: [],
    rollingSummary: null,
    isStreaming: false,
    latestActivityLabel: "Executed DCA purchase: 0.01 ETH with safety checks passed.",
    suggestion: AGENT_SUGGESTION,
    pendingApproval: null,
    pendingAgentAction: null,
    createdAt: now,
    updatedAt: now,
  };
}

function createInitialThread(): Thread {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "Find me the best yield for USDC",
    messages: AGENT_MESSAGES,
    rollingSummary: null,
    isStreaming: false,
    latestActivityLabel: "Executed DCA purchase: 0.01 ETH with safety checks passed.",
    suggestion: AGENT_SUGGESTION,
    pendingApproval: PENDING_APPROVAL_TX,
    pendingAgentAction: null,
    createdAt: now,
    updatedAt: now,
  };
}

const INITIAL_THREAD = createInitialThread();

export const useAgentThreadStore = create<AgentThreadStore>()(
  persist(
    (set, get) => ({
      threads: [INITIAL_THREAD],
      activeThreadId: INITIAL_THREAD.id,

      createThread: () => {
        const thread = createEmptyThread();
        set((state) => ({
          threads: [thread, ...state.threads],
          activeThreadId: thread.id,
        }));
      },

      setActiveThreadId: (id) => {
        set({ activeThreadId: id });
      },

      sendMessage: (threadId, content) => {
        const trimmedContent = content.trim();
        if (trimmedContent.length === 0) return;

        const userMessage: AgentMessage = {
          id: `user-${crypto.randomUUID()}`,
          role: "user",
          blocks: [{ type: "text", content: trimmedContent }],
        };
        const agentMessageId = `agent-${crypto.randomUUID()}`;
        const now = Date.now();
        const newTitle = deriveTitle([
          ...(get().threads.find((t) => t.id === threadId)?.messages ?? []),
          userMessage,
        ]);

        set((state) => {
          const thread = state.threads.find((t) => t.id === threadId);
          if (!thread) return state;
          return {
            threads: state.threads.map((t) =>
              t.id === threadId
                ? {
                    ...t,
                    messages: [
                      ...t.messages,
                      userMessage,
                      {
                        id: agentMessageId,
                        role: "agent" as const,
                        blocks: [{ type: "text" as const, content: "Thinking…" }],
                      },
                    ],
                    isStreaming: true,
                    title: t.title ?? newTitle,
                    updatedAt: now,
                  }
                : t,
            ),
          };
        });

        void (async () => {
          const model = useOllamaStore.getState().selectedModel;
          if (!model?.trim()) {
            useOllamaStore.getState().openSetupModal();
            set((state) => ({
              ...state,
              threads: state.threads.map((t) =>
                t.id === threadId
                  ? {
                      ...t,
                      isStreaming: false,
                      messages: t.messages.map((msg) =>
                        msg.id === agentMessageId
                          ? {
                              ...msg,
                              blocks: [
                                {
                                  type: "text" as const,
                                  content:
                                    "Please select an AI model from the dropdown above.",
                                },
                              ],
                            }
                          : msg,
                      ),
                      updatedAt: Date.now(),
                    }
                  : t,
              ),
            }));
            return;
          }
          const thread = get().threads.find((t) => t.id === threadId);
          if (!thread) return;
          const messagesExcludingPlaceholder = thread.messages.filter(
            (m) => m.id !== agentMessageId,
          );
          const contextBudget = resolveContextBudget(model);
          const chatMessages = messagesToChat(messagesExcludingPlaceholder);
          const latestN = chatMessages.slice(-10).map((m) => ({
            role: m.role === "user" ? "user" : "assistant",
            content: m.content,
          }));
          const { activeAddress, addresses } = useWalletStore.getState();
          const walletAddress = activeAddress ?? null;
          const walletAddresses =
            addresses.length > 0 ? addresses : (activeAddress ? [activeAddress] : []);

          try {
            const response = await chatAgent({
              model,
              messages: latestN,
              walletAddress,
              walletAddresses: walletAddresses.length > 0 ? walletAddresses : null,
              numCtx: contextBudget,
            });

            if (response.kind === "assistantMessage") {
              const blocks = response.blocks.map((b) => {
                if (b.type === "text") {
                  return { type: "text" as const, content: b.content };
                }
                return {
                  type: "toolResult" as const,
                  toolName: b.toolName,
                  content: b.content,
                };
              });
              if (blocks.length === 0 && response.content) {
                blocks.push({ type: "text" as const, content: response.content });
              } else if (blocks.length === 0) {
                blocks.push({ type: "text" as const, content: "Done." });
              }
              set((state) => {
                const t = state.threads.find((th) => th.id === threadId);
                if (!t) return state;
                return {
                  threads: state.threads.map((th) =>
                    th.id === threadId
                      ? {
                          ...th,
                          isStreaming: false,
                          latestActivityLabel: "Agent replied.",
                          messages: th.messages.map((msg) =>
                            msg.id === agentMessageId
                              ? { ...msg, blocks }
                              : msg,
                          ),
                          updatedAt: Date.now(),
                        }
                      : th,
                  ),
                };
              });
            } else if (response.kind === "approvalRequired") {
              const p = response.payload as SwapPreviewPayload;
              const approval: ApprovalTransaction = {
                id: `approval-${crypto.randomUUID()}`,
                strategyId: `agent-${response.toolName}`,
                action: `Swap ${p.fromToken} → ${p.toToken}`,
                amount: p.amount,
                chain: p.chain,
                slippage: p.slippage,
                gas: p.gasEstimate,
                reason: response.message,
                executionWindow: "30 seconds",
              };
              const approvalBlock: AgentMessageBlock = {
                type: "approvalRequest",
                toolName: response.toolName,
                payload: p,
                message: response.message,
              };
              set((state) => {
                const t = state.threads.find((th) => th.id === threadId);
                if (!t) return state;
                const blocks: AgentMessageBlock[] = [
                  { type: "text" as const, content: response.message },
                  approvalBlock,
                ];
                return {
                  threads: state.threads.map((th) =>
                    th.id === threadId
                      ? {
                          ...th,
                          isStreaming: false,
                          latestActivityLabel: "Approval required",
                          messages: th.messages.map((msg) =>
                            msg.id === agentMessageId
                              ? { ...msg, blocks }
                              : msg,
                          ),
                          pendingApproval: approval,
                          pendingAgentAction: {
                            toolName: response.toolName,
                            payload: p,
                          },
                          updatedAt: Date.now(),
                        }
                      : th,
                  ),
                };
              });
            } else {
              const fallback =
                response.kind === "error"
                  ? response.message
                  : "Sorry, I couldn't complete that.";
              set((state) => {
                const t = state.threads.find((th) => th.id === threadId);
                if (!t) return state;
                return {
                  threads: state.threads.map((th) =>
                    th.id === threadId
                      ? {
                          ...th,
                          isStreaming: false,
                          latestActivityLabel: "Agent error",
                          messages: th.messages.map((msg) =>
                            msg.id === agentMessageId
                              ? {
                                  ...msg,
                                  blocks: [
                                    {
                                      type: "text" as const,
                                      content: fallback,
                                    },
                                  ],
                                }
                              : msg,
                          ),
                          updatedAt: Date.now(),
                        }
                      : th,
                  ),
                };
              });
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const fallback = `Sorry, I couldn't complete that. ${msg}`;
            set((state) => {
              const t = state.threads.find((th) => th.id === threadId);
              if (!t) return state;
              return {
                threads: state.threads.map((th) =>
                  th.id === threadId
                    ? {
                        ...th,
                        isStreaming: false,
                        latestActivityLabel: "Agent error",
                        messages: th.messages.map((msg) =>
                          msg.id === agentMessageId
                            ? { ...msg, blocks: [{ type: "text" as const, content: fallback }] }
                            : msg,
                        ),
                        updatedAt: Date.now(),
                      }
                    : th,
                ),
              };
            });
          }
        })();
      },

      deleteThread: (id) => {
        set((state) => {
          if (state.threads.length <= 1) return state;
          const next = state.threads.filter((t) => t.id !== id);
          const nextActive =
            state.activeThreadId === id ? next[0]?.id ?? null : state.activeThreadId;
          return {
            threads: next,
            activeThreadId: nextActive,
          };
        });
      },

      clearPendingApprovalForThread: (threadId) => {
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  pendingApproval: null,
                  pendingAgentAction: null,
                  updatedAt: Date.now(),
                }
              : t,
          ),
        }));
      },
    }),
    {
      name: "shadow-agent-threads",
      partialize: (state) => ({
        threads: state.threads,
        activeThreadId: state.activeThreadId,
      }),
      migrate: (persisted, _version) => {
        const p = persisted as { threads?: Thread[]; activeThreadId?: string | null };
        const threads = (p.threads ?? []).map((t) => ({
          ...t,
          rollingSummary: "rollingSummary" in t ? t.rollingSummary : null,
          pendingAgentAction: "pendingAgentAction" in t ? t.pendingAgentAction : null,
        }));
        return { ...p, threads } as typeof persisted;
      },
      version: 1,
    },
  ),
);

export function getActiveThread(threads: Thread[], activeId: string | null): Thread | null {
  if (!activeId) return threads[0] ?? null;
  return threads.find((t) => t.id === activeId) ?? threads[0] ?? null;
}

export function getPendingApprovalForApp(
  thread: Thread | null,
): ApprovalTransaction {
  return thread?.pendingApproval ?? EMPTY_APPROVAL;
}

export function getPendingAgentActionForApp(
  thread: Thread | null,
): PendingAgentAction | null {
  return thread?.pendingAgentAction ?? null;
}
