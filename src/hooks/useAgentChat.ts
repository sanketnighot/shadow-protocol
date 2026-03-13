import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import {
  getActiveThread,
  getPendingApprovalForApp,
  getPendingAgentActionForApp,
  useAgentThreadStore,
} from "@/store/useAgentThreadStore";
import { useUiStore } from "@/store/useUiStore";

export function useAgentChat() {
  const threads = useAgentThreadStore((state) => state.threads);
  const activeThreadId = useAgentThreadStore((state) => state.activeThreadId);
  const sendMessageFromStore = useAgentThreadStore((state) => state.sendMessage);
  const clearPendingApprovalForThread = useAgentThreadStore(
    (state) => state.clearPendingApprovalForThread,
  );
  const clearPendingApproval = useUiStore((state) => state.clearPendingApproval);

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
      await invoke("approve_agent_action", {
        input: {
          toolName: pendingAgentAction.toolName,
          payload: pendingAgentAction.payload,
        },
      });
      clearPendingApprovalForThread(activeThread.id);
      clearPendingApproval();
    } catch {
      // error is surfaced in the UI by keeping the card visible; just reset pending state
    } finally {
      setIsApprovePending(false);
    }
  }, [pendingAgentAction, activeThread, clearPendingApprovalForThread, clearPendingApproval]);

  const rejectAction = useCallback(() => {
    if (!activeThread) return;
    clearPendingApprovalForThread(activeThread.id);
    clearPendingApproval();
  }, [activeThread, clearPendingApprovalForThread, clearPendingApproval]);

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
