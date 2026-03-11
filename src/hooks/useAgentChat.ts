import { AGENT_MESSAGES, AGENT_SUGGESTION } from "@/data/mock";

export function useAgentChat() {
  return {
    messages: AGENT_MESSAGES,
    suggestion: AGENT_SUGGESTION,
    latestActivityLabel: "Executed DCA purchase: 0.01 ETH with safety checks passed.",
  };
}
