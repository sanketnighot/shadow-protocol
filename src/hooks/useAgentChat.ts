import {
  AGENT_MESSAGES,
  AGENT_SUGGESTION,
  PENDING_APPROVAL_TX,
} from "@/data/mock";

export function useAgentChat() {
  return {
    messages: AGENT_MESSAGES,
    suggestion: AGENT_SUGGESTION,
    pendingApproval: PENDING_APPROVAL_TX,
    latestActivityLabel: "Executed DCA purchase: 0.01 ETH with safety checks passed.",
  };
}
