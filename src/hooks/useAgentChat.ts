import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import {
  getActiveThread,
  getPendingApprovalForApp,
  getPendingAgentActionForApp,
  useAgentThreadStore,
} from "@/store/useAgentThreadStore";
import { useUiStore } from "@/store/useUiStore";
import type { ApproveAgentActionResult } from "@/types/agent";
import { useToast } from "@/hooks/useToast";

export function useAgentChat() {
  const threads = useAgentThreadStore((state) => state.threads);
  const activeThreadId = useAgentThreadStore((state) => state.activeThreadId);
  const sendMessageFromStore = useAgentThreadStore((state) => state.sendMessage);
  const clearPendingApprovalForThread = useAgentThreadStore(
    (state) => state.clearPendingApprovalForThread,
  );
  const recordApprovalFollowUp = useAgentThreadStore(
    (state) => state.recordApprovalFollowUp,
  );
  const clearPendingApproval = useUiStore((state) => state.clearPendingApproval);
  const { success, warning } = useToast();

  const activeThread = getActiveThread(threads, activeThreadId);
  const pendingAgentAction = getPendingAgentActionForApp(activeThread);

  const [isApprovePending, setIsApprovePending] = useState(false);

  const sendMessage = useCallback(
    (content: string) => {
      if (!activeThread) return;
      sendMessageFromStore(activeThread.id, content);
    },
    [activeThread, sendMessageFromStore],
  );

  const approveAction = useCallback(async () => {
    if (!pendingAgentAction || !activeThread) return;
    setIsApprovePending(true);
    try {
      const result = await invoke<ApproveAgentActionResult>("approve_agent_action", {
        input: {
          toolName: pendingAgentAction.toolName,
          payload: pendingAgentAction.payload,
        },
      });
      
      if (result.success) {
        success("Action Approved", result.message);
        recordApprovalFollowUp(activeThread.id, true);
        clearPendingApproval();
      } else {
        warning("Action Failed", result.message);
        // We don't record follow-up so the card stays visible for retry or manual action
      }
    } catch (err) {
      warning("Error", String(err));
    } finally {
      setIsApprovePending(false);
    }
  }, [pendingAgentAction, activeThread, recordApprovalFollowUp, clearPendingApproval, success, warning]);

  const rejectAction = useCallback(() => {
    if (!activeThread) return;
    recordApprovalFollowUp(activeThread.id, false);
    clearPendingApproval();
  }, [activeThread, recordApprovalFollowUp, clearPendingApproval]);

  return {
    isStreaming: activeThread?.isStreaming ?? false,
    latestActivityLabel: activeThread?.latestActivityLabel ?? "",
    messages: activeThread?.messages ?? [],
    pendingApproval: getPendingApprovalForApp(activeThread),
    pendingAgentAction,
    clearPendingApprovalForThread,
    suggestion: activeThread?.suggestion ?? { title: "", summary: "", actionLabel: "" },
    sendMessage,
    approveAction,
    rejectAction,
    isApprovePending,
    activeThread,
    activeThreadId,
    threads,
  };
}
