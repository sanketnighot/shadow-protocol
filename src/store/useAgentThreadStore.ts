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
import { chatAgent } from "@/lib/agent";
import {
  buildChatMessages,
  extractStructuredFacts,
  generateRollingSummary,
  mergeStructuredFacts,
  needsSummary,
  resolveContextBudget,
} from "@/lib/chatContext";
import { useOllamaStore } from "@/store/useOllamaStore";
import { useWalletStore } from "@/store/useWalletStore";
import type { StrategyProposalPayload, SwapPreviewPayload } from "@/types/agent";

export type PendingAgentAction = {
  approvalId: string;
  toolName: string;
  payload: unknown;
  expectedVersion: number;
};

export type Thread = {
  id: string;
  title: string | null;
  messages: AgentMessage[];
  /** Persisted rolling summary of older messages when context exceeds budget. */
  rollingSummary: string | null;
  /** Recent structured facts from tool outputs for follow-up context. */
  structuredFacts: string | null;
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
  return text.length > 0
    ? text.slice(0, 48) + (text.length > 48 ? "…" : "")
    : null;
}

type AgentThreadStore = {
  threads: Thread[];
  activeThreadId: string | null;
  createThread: () => void;
  startThreadWithDraft: (title: string, prompt: string) => void;
  openMarketApprovalThread: (input: {
    title: string;
    message: string;
    toolName: string;
    payload: Record<string, unknown>;
    approvalId: string;
    expectedVersion: number;
  }) => void;
  setActiveThreadId: (id: string | null) => void;
  sendMessage: (
    threadId: string,
    content: string,
    metadata?: { hidden?: boolean },
  ) => void;
  deleteThread: (id: string) => void;
  clearPendingApprovalForThread: (threadId: string) => void;
  recordApprovalFollowUp: (threadId: string, approved: boolean) => void;
};

function createEmptyThread(): Thread {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: null,
    messages: [],
    rollingSummary: null,
    structuredFacts: null,
    isStreaming: false,
    latestActivityLabel:
      "Executed DCA purchase: 0.01 ETH with safety checks passed.",
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
    structuredFacts: null,
    isStreaming: false,
    latestActivityLabel:
      "Executed DCA purchase: 0.01 ETH with safety checks passed.",
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

      startThreadWithDraft: (title, prompt) => {
        const thread = createEmptyThread();
        thread.title = title.trim() || null;
        set((state) => ({
          threads: [thread, ...state.threads],
          activeThreadId: thread.id,
        }));
        get().sendMessage(thread.id, prompt);
      },

      openMarketApprovalThread: ({
        title,
        message,
        toolName,
        payload,
        approvalId,
        expectedVersion,
      }) => {
        const thread = createEmptyThread();
        thread.title = title.trim() || "Market opportunity";
        thread.latestActivityLabel = "Market approval required";
        thread.messages = [
          {
            id: `agent-${crypto.randomUUID()}`,
            role: "agent",
            blocks: [
              { type: "text", content: message },
              {
                type: "approvalRequest",
                toolName,
                payload,
                message,
              },
            ],
          },
        ];
        thread.pendingAgentAction = {
          approvalId,
          toolName,
          payload,
          expectedVersion,
        };
        thread.pendingApproval = {
          id: approvalId,
          strategyId: `market-${toolName}`,
          action: title,
          amount: "Policy draft",
          chain: "Policy",
          slippage: "N/A",
          gas: "N/A",
          reason: message,
          executionWindow: "15 minutes",
        };
        set((state) => ({
          threads: [thread, ...state.threads],
          activeThreadId: thread.id,
        }));
      },

      setActiveThreadId: (id) => {
        set({ activeThreadId: id });
      },

      sendMessage: (threadId, content, metadata) => {
        const trimmedContent = content.trim();
        if (trimmedContent.length === 0) return;

        const userMessage: AgentMessage = {
          id: `user-${crypto.randomUUID()}`,
          role: "user",
          blocks: [{ type: "text", content: trimmedContent }],
          metadata,
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
                        blocks: [
                          { type: "text" as const, content: "Thinking…" },
                        ],
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
          let thread = get().threads.find((t) => t.id === threadId);
          if (!thread) return;
          const messagesExcludingPlaceholder = thread.messages.filter(
            (m) => m.id !== agentMessageId,
          );
          const contextBudget = resolveContextBudget(model);
          if (
            needsSummary(messagesExcludingPlaceholder, contextBudget) &&
            !thread.rollingSummary
          ) {
            const older = messagesExcludingPlaceholder.slice(0, -10);
            const summary = await generateRollingSummary(older, model);
            set((s) => ({
              threads: s.threads.map((t) =>
                t.id === threadId
                  ? {
                      ...t,
                      rollingSummary: summary || null,
                      updatedAt: Date.now(),
                    }
                  : t,
              ),
            }));
            thread = get().threads.find((t) => t.id === threadId) ?? thread;
          }
          const built = buildChatMessages({
            messages: thread.messages.filter((m) => m.id !== agentMessageId),
            rollingSummary: thread.rollingSummary,
            contextBudget,
            latestN: 10,
          });
          const messagesForAgent = built
            .filter((m) => m.role !== "system")
            .map((m) => ({ role: m.role, content: m.content }));
          if (messagesForAgent.length === 0) return;
          const { activeAddress, addresses } = useWalletStore.getState();
          const walletAddress = activeAddress ?? null;
          const walletAddresses =
            addresses.length > 0
              ? addresses
              : activeAddress
                ? [activeAddress]
                : [];

          try {
            const response = await chatAgent({
              model,
              messages: messagesForAgent,
              walletAddress,
              walletAddresses:
                walletAddresses.length > 0 ? walletAddresses : null,
              numCtx: contextBudget,
              structuredFacts: thread.structuredFacts,
              demoMode: true,
            });

            if (response.kind === "assistantMessage") {
              const blocks = response.blocks.map((b) => {
                if (b.type === "text") {
                  return { type: "text" as const, content: b.content };
                }
                if (b.type === "decisionResult") {
                  return {
                    type: "decisionResult" as const,
                    insights: b.insights,
                    decision: b.decision,
                    simulated: b.simulated,
                  };
                }
                if (b.type === "strategyProposal") {
                  return {
                    type: "strategyProposal" as const,
                    proposal: b.proposal,
                  };
                }
                return {
                  type: "toolResult" as const,
                  toolName: (b as any).toolName,
                  content: (b as any).content,
                };
              });
              if (blocks.length === 0 && response.content) {
                blocks.push({
                  type: "text" as const,
                  content: response.content,
                });
              } else if (blocks.length === 0) {
                blocks.push({ type: "text" as const, content: "Done." });
              }
              const t = get().threads.find((th) => th.id === threadId);
              let mergedFacts = t?.structuredFacts ?? null;
              for (const b of response.blocks) {
                if (b.type === "toolResult") {
                  const facts = extractStructuredFacts(b.toolName, b.content);
                  if (facts)
                    mergedFacts = mergeStructuredFacts(mergedFacts, facts);
                }
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
                          structuredFacts:
                            mergedFacts !== null
                              ? mergedFacts
                              : th.structuredFacts,
                          updatedAt: Date.now(),
                        }
                      : th,
                  ),
                };
              });
            } else if (response.kind === "approvalRequired") {
              const approval: ApprovalTransaction =
                response.toolName === "execute_token_swap"
                  ? (() => {
                      const p = response.payload as SwapPreviewPayload;
                      return {
                        id: response.approvalId,
                        strategyId: `agent-${response.toolName}`,
                        action: `Swap ${p.fromToken} → ${p.toToken}`,
                        amount: p.amount,
                        chain: p.chain,
                        slippage: p.slippage,
                        gas: p.gasEstimate,
                        reason: response.message,
                        executionWindow: "15 minutes",
                      };
                    })()
                  : (() => {
                      const p = response.payload as StrategyProposalPayload;
                      return {
                        id: response.approvalId,
                        strategyId: `agent-${response.toolName}`,
                        action: `Create strategy: ${p.name}`,
                        amount: "N/A",
                        chain: "Policy",
                        slippage: "N/A",
                        gas: "N/A",
                        reason: response.message,
                        executionWindow: "15 minutes",
                      };
                    })();
              const approvalBlock: AgentMessageBlock = {
                type: "approvalRequest",
                toolName: response.toolName,
                payload: response.payload,
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
                            approvalId: response.approvalId,
                            toolName: response.toolName,
                            payload: response.payload,
                            expectedVersion: response.version,
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
                            ? {
                                ...msg,
                                blocks: [
                                  { type: "text" as const, content: fallback },
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
        })();
      },

      deleteThread: (id) => {
        set((state) => {
          if (state.threads.length <= 1) return state;
          const next = state.threads.filter((t) => t.id !== id);
          const nextActive =
            state.activeThreadId === id
              ? (next[0]?.id ?? null)
              : state.activeThreadId;
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

      recordApprovalFollowUp: (threadId, approved) => {
        set((state) => ({
          threads: state.threads.map((t) => {
            if (t.id !== threadId) return t;
            const lastAgent = [...t.messages]
              .reverse()
              .find((m) => m.role === "agent");
            if (!lastAgent)
              return {
                ...t,
                pendingApproval: null,
                pendingAgentAction: null,
                updatedAt: Date.now(),
              };
            const followUp: AgentMessageBlock = {
              type: "text",
              content: approved ? "✓ Approved." : "Rejected.",
            };
            return {
              ...t,
              messages: t.messages.map((msg) =>
                msg.id === lastAgent.id
                  ? { ...msg, blocks: [...msg.blocks, followUp] }
                  : msg,
              ),
              pendingApproval: null,
              pendingAgentAction: null,
              updatedAt: Date.now(),
            };
          }),
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
        const p = persisted as {
          threads?: Thread[];
          activeThreadId?: string | null;
        };
        const threads = (p.threads ?? []).map((t) => ({
          ...t,
          rollingSummary: "rollingSummary" in t ? t.rollingSummary : null,
          structuredFacts: "structuredFacts" in t ? t.structuredFacts : null,
          pendingAgentAction:
            "pendingAgentAction" in t ? t.pendingAgentAction : null,
        }));
        return { ...p, threads } as typeof persisted;
      },
      version: 1,
    },
  ),
);

export function getActiveThread(
  threads: Thread[],
  activeId: string | null,
): Thread | null {
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
