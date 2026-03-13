import { invoke } from "@tauri-apps/api/core";

import type {
  ApproveAgentActionInput,
  ApproveAgentActionResult,
  ChatAgentInput,
  ChatAgentResponse,
} from "@/types/agent";

export async function chatAgent(
  input: ChatAgentInput,
): Promise<ChatAgentResponse> {
  const payload = {
    model: input.model,
    messages: input.messages,
    walletAddress: input.walletAddress ?? null,
    numCtx: input.numCtx ?? null,
  };
  return invoke<ChatAgentResponse>("chat_agent", { input: payload });
}

export async function approveAgentAction(
  input: ApproveAgentActionInput,
): Promise<ApproveAgentActionResult> {
  return invoke<ApproveAgentActionResult>("approve_agent_action", {
    input: {
      toolName: input.toolName,
      payload: input.payload,
    },
  });
}
