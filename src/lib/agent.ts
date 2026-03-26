import { invoke } from "@tauri-apps/api/core";

import type {
  ApproveAgentActionInput,
  ApproveAgentActionResult,
  ChatAgentInput,
  ChatAgentResponse,
  ExecutionLogRecord,
  PendingApprovalRecord,
  RejectAgentActionInput,
  RejectAgentActionResult,
} from "@/types/agent";

export async function chatAgent(
  input: ChatAgentInput,
): Promise<ChatAgentResponse> {
  const payload = {
    model: input.model,
    messages: input.messages,
    walletAddress: input.walletAddress ?? null,
    walletAddresses: input.walletAddresses ?? null,
    numCtx: input.numCtx ?? null,
    structuredFacts: input.structuredFacts ?? null,
    demoMode: input.demoMode ?? true,
  };
  return invoke<ChatAgentResponse>("chat_agent", { input: payload });
}

export async function approveAgentAction(
  input: ApproveAgentActionInput,
): Promise<ApproveAgentActionResult> {
  return invoke<ApproveAgentActionResult>("approve_agent_action", {
    input: {
      approvalId: input.approvalId,
      toolName: input.toolName,
      payload: input.payload,
      expectedVersion: input.expectedVersion,
    },
  });
}

export async function rejectAgentAction(
  input: RejectAgentActionInput,
): Promise<RejectAgentActionResult> {
  return invoke<RejectAgentActionResult>("reject_agent_action", {
    input: {
      approvalId: input.approvalId,
      expectedVersion: input.expectedVersion,
    },
  });
}

export async function getPendingApprovals(): Promise<PendingApprovalRecord[]> {
  return invoke<PendingApprovalRecord[]>("get_pending_approvals", {
    input: {},
  });
}

export async function getExecutionLog(limit = 100): Promise<ExecutionLogRecord[]> {
  return invoke<ExecutionLogRecord[]>("get_execution_log", {
    input: { limit },
  });
}

import type { AgentSoul, AgentMemory, AgentMemoryItem } from "@/types/agent";

export async function getAgentSoul(): Promise<AgentSoul> {
  return invoke<AgentSoul>("get_agent_soul");
}

export async function updateAgentSoul(soul: AgentSoul): Promise<void> {
  return invoke<void>("update_agent_soul", { soul });
}

export async function getAgentMemory(): Promise<AgentMemory> {
  return invoke<AgentMemory>("get_agent_memory");
}

export async function addAgentMemory(fact: string): Promise<AgentMemoryItem> {
  return invoke<AgentMemoryItem>("add_agent_memory", { fact });
}

export async function removeAgentMemory(id: string): Promise<void> {
  return invoke<void>("remove_agent_memory", { id });
}
