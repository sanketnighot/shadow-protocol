import { create } from "zustand";

import {
  AGENT_MESSAGES,
  AGENT_SUGGESTION,
  PENDING_APPROVAL_TX,
  type AgentMessage,
  type AgentMessageBlock,
} from "@/data/mock";

type AgentReply = {
  latestActivityLabel: string;
  blocks: AgentMessageBlock[];
};

type AgentChatStore = {
  isStreaming: boolean;
  latestActivityLabel: string;
  messages: AgentMessage[];
  pendingApproval: typeof PENDING_APPROVAL_TX;
  suggestion: typeof AGENT_SUGGESTION;
  sendMessage: (content: string) => void;
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

const INITIAL_STATE = {
  isStreaming: false,
  latestActivityLabel: "Executed DCA purchase: 0.01 ETH with safety checks passed.",
  messages: AGENT_MESSAGES,
  pendingApproval: PENDING_APPROVAL_TX,
  suggestion: AGENT_SUGGESTION,
};

export const useAgentChat = create<AgentChatStore>((set) => ({
  ...INITIAL_STATE,
  sendMessage: (content) => {
    const trimmedContent = content.trim();

    if (trimmedContent.length === 0) {
      return;
    }

    const reply = buildReply(trimmedContent);
    const userMessage: AgentMessage = {
      id: `user-${crypto.randomUUID()}`,
      role: "user",
      blocks: [{ type: "text", content: trimmedContent }],
    };
    const agentMessageId = `agent-${crypto.randomUUID()}`;
    const streamingBlock = reply.blocks.find((block) => block.type === "text");
    const streamingContent =
      streamingBlock?.type === "text" ? streamingBlock.content : "Working through your request.";

    set((state) => ({
      isStreaming: true,
      messages: [
        ...state.messages,
        userMessage,
        {
          id: agentMessageId,
          role: "agent",
          blocks: [{ type: "text", content: "" }],
        },
      ],
    }));

    let step = 0;
    const nextSteps = Math.max(streamingContent.length, 1);
    const interval = window.setInterval(() => {
      step += 5;

      set((state) => ({
        messages: state.messages.map((message) => {
          if (message.id !== agentMessageId) {
            return message;
          }

          return {
            ...message,
            blocks: [{ type: "text", content: streamingContent.slice(0, step) }],
          };
        }),
      }));

      if (step >= nextSteps) {
        window.clearInterval(interval);
        set((state) => ({
          isStreaming: false,
          latestActivityLabel: reply.latestActivityLabel,
          messages: state.messages.map((message) =>
            message.id === agentMessageId ? { ...message, blocks: reply.blocks } : message,
          ),
        }));
      }
    }, 45);
  },
}));
