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

export type Thread = {
  id: string;
  title: string | null;
  messages: AgentMessage[];
  isStreaming: boolean;
  latestActivityLabel: string;
  suggestion: AgentSuggestion;
  pendingApproval: ApprovalTransaction | null;
  createdAt: number;
  updatedAt: number;
};

type AgentReply = {
  latestActivityLabel: string;
  blocks: AgentMessageBlock[];
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

function buildReply(content: string): AgentReply {
  const normalizedContent = content.toLowerCase();

  if (normalizedContent.includes("yield")) {
    return {
      latestActivityLabel: "Scanned fresh yield routes and ranked the safest USDC deployment.",
      blocks: [
        {
          type: "text",
          content:
            "I scanned the latest yield routes across your preferred chains and filtered out higher slippage options.",
        },
        {
          type: "opportunity",
          title: "Aave V3 on Arbitrum",
          apy: "4.2%",
          tvl: "$1.2B",
          risk: "Low",
          actionLabel: "Deploy $500",
        },
        {
          type: "text",
          content:
            "If you want, I can also surface two higher-yield alternatives with more execution risk.",
        },
      ],
    };
  }

  if (normalizedContent.includes("swap")) {
    return {
      latestActivityLabel: "Prepared a private swap route and checked the current gas posture.",
      blocks: [
        {
          type: "text",
          content:
            "I found a private route with competitive pricing and low gas overhead for the swap you described.",
        },
        {
          type: "text",
          content:
            "Open the portfolio flow if you want to preview the route and confirm slippage before execution.",
        },
      ],
    };
  }

  if (normalizedContent.includes("options") || normalizedContent.includes("more")) {
    return {
      latestActivityLabel: "Queued alternative options with wider spreads and higher variance.",
      blocks: [
        {
          type: "text",
          content:
            "I can surface more options, but the next routes add more volatility exposure and thinner liquidity.",
        },
        {
          type: "text",
          content:
            "The current Aave route still scores best for your guardrails, but I can switch to an opportunity-led view if you prefer.",
        },
      ],
    };
  }

  return {
    latestActivityLabel: "Updated the local agent context with a fresh recommendation.",
    blocks: [
      {
        type: "text",
        content:
          "I updated your local context and can turn this into a strategy, a portfolio action, or a market watchlist next.",
      },
    ],
  };
}

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
};

function createEmptyThread(): Thread {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: null,
    messages: [],
    isStreaming: false,
    latestActivityLabel: "Executed DCA purchase: 0.01 ETH with safety checks passed.",
    suggestion: AGENT_SUGGESTION,
    pendingApproval: null,
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
    isStreaming: false,
    latestActivityLabel: "Executed DCA purchase: 0.01 ETH with safety checks passed.",
    suggestion: AGENT_SUGGESTION,
    pendingApproval: PENDING_APPROVAL_TX,
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

        const reply = buildReply(trimmedContent);
        const userMessage: AgentMessage = {
          id: `user-${crypto.randomUUID()}`,
          role: "user",
          blocks: [{ type: "text", content: trimmedContent }],
        };
        const agentMessageId = `agent-${crypto.randomUUID()}`;
        const streamingBlock = reply.blocks.find((block) => block.type === "text");
        const streamingContent =
          streamingBlock?.type === "text"
            ? streamingBlock.content
            : "Working through your request.";

        const now = Date.now();
        const newTitle = deriveTitle([...get().threads.find((t) => t.id === threadId)?.messages ?? [], userMessage]);

        set((state) => {
          const thread = state.threads.find((t) => t.id === threadId);
          if (!thread) return state;

          const updatedThread: Thread = {
            ...thread,
            messages: [
              ...thread.messages,
              userMessage,
              {
                id: agentMessageId,
                role: "agent",
                blocks: [{ type: "text", content: "" }],
              },
            ],
            isStreaming: true,
            title: thread.title ?? newTitle,
            updatedAt: now,
          };

          return {
            threads: state.threads.map((t) => (t.id === threadId ? updatedThread : t)),
          };
        });

        let step = 0;
        const nextSteps = Math.max(streamingContent.length, 1);
        const interval = window.setInterval(() => {
          step += 5;
          set((state) => {
            const thread = state.threads.find((t) => t.id === threadId);
            if (!thread) return state;

            return {
              threads: state.threads.map((t) => {
                if (t.id !== threadId) return t;
                return {
                  ...t,
                  messages: t.messages.map((message) => {
                    if (message.id !== agentMessageId) return message;
                    return {
                      ...message,
                      blocks: [{ type: "text", content: streamingContent.slice(0, step) }],
                    };
                  }),
                };
              }),
            };
          });

          if (step >= nextSteps) {
            window.clearInterval(interval);
            set((state) => {
              const thread = state.threads.find((t) => t.id === threadId);
              if (!thread) return state;

              return {
                threads: state.threads.map((t) => {
                  if (t.id !== threadId) return t;
                  return {
                    ...t,
                    isStreaming: false,
                    latestActivityLabel: reply.latestActivityLabel,
                    messages: t.messages.map((message) =>
                      message.id === agentMessageId ? { ...message, blocks: reply.blocks } : message,
                    ),
                    updatedAt: Date.now(),
                  };
                }),
              };
            });
          }
        }, 45);
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
    }),
    {
      name: "shadow-agent-threads",
      partialize: (state) => ({
        threads: state.threads,
        activeThreadId: state.activeThreadId,
      }),
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
