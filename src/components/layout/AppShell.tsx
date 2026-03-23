import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Toaster } from "sonner";

import { ActivityBell } from "@/components/layout/ActivityBell";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { Dock } from "@/components/layout/Dock";
import { MainContent } from "@/components/layout/MainContent";
import { MinimalTopBar } from "@/components/layout/MinimalTopBar";
import { NewUpdateCard } from "@/components/layout/NewUpdateCard";
import { PanicModal } from "@/components/shared/PanicModal";
import { ShadowBriefSheet } from "@/components/layout/ShadowBriefSheet";
import { OllamaSetup } from "@/components/OllamaSetup";
import { InitializationSequence } from "@/components/onboarding/InitializationSequence";
import { UnlockDialog } from "@/components/wallet/UnlockDialog";
import { ApprovalModal } from "@/components/shared/ApprovalModal";
import { useAgentChat } from "@/hooks/useAgentChat";
import { useToast } from "@/hooks/useToast";
import { checkOllamaStatus } from "@/lib/ollama";
import { useOllamaStore } from "@/store/useOllamaStore";
import { useSessionStore } from "@/store/useSessionStore";
import { useUiStore } from "@/store/useUiStore";
import { useWalletStore } from "@/store/useWalletStore";
import { useTxConfirmationListener, useWalletSyncListeners, useShadowAlertListener } from "@/store/useWalletSyncStore";
import { useShadowHeartbeat } from "@/hooks/useShadowHeartbeat";

type SessionStatusResult = { locked: boolean; expiresAtSecs?: number };

export function AppShell() {
  const [showApprovalSuccess, setShowApprovalSuccess] = useState(false);
  const [showBrief, setShowBrief] = useState(false);

  const addresses = useWalletStore((s) => s.addresses);
  const activeAddress = useWalletStore((s) => s.activeAddress);
  const refreshWallets = useWalletStore((s) => s.refreshWallets);
  const setUnlocked = useSessionStore((s) => s.setUnlocked);
  const setLocked = useSessionStore((s) => s.setLocked);
  const setActiveAddress = useSessionStore((s) => s.setActiveAddress);
  const showUnlockDialog = useSessionStore((s) => s.showUnlockDialog);
  const openUnlockDialog = useSessionStore((s) => s.openUnlockDialog);
  const closeUnlockDialog = useSessionStore((s) => s.closeUnlockDialog);

  const clearPendingApproval = useUiStore(
    (state) => state.clearPendingApproval,
  );
  const openCommandPalette = useUiStore((state) => state.openCommandPalette);
  const pendingApprovalId = useUiStore((state) => state.pendingApprovalId);
  const activeSignalPayload = useUiStore((state) => state.activeSignalPayload);
  const activeSignalToolName = useUiStore((state) => state.activeSignalToolName);
  const themePreference = useUiStore((state) => state.themePreference);
  const { pendingApproval, approveAction, rejectAction } = useAgentChat();
  const { info, success } = useToast();
  const setupComplete = useOllamaStore((s) => s.setupComplete);
  const openOllamaSetup = useOllamaStore((s) => s.openSetupModal);
  const setOllamaLastStatus = useOllamaStore((s) => s.setLastStatus);

  const resolvedTheme = useMemo(() => {
    if (themePreference !== "system") return themePreference;
    if (typeof window === "undefined") return "dark";
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }, [themePreference]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    void refreshWallets();
  }, [refreshWallets]);

  const setSelectedModel = useOllamaStore((s) => s.setSelectedModel);

  useWalletSyncListeners();
  useTxConfirmationListener();
  useShadowAlertListener();
  useShadowHeartbeat();

  useEffect(() => {
    const checkOllama = async () => {
      try {
        const status = await checkOllamaStatus();
        setOllamaLastStatus(status);
        const needsSetup =
          !status.installed ||
          !status.running ||
          status.models.length === 0;
        if (needsSetup) {
          openOllamaSetup();
        } else if (status.models.length > 0) {
          const current = useOllamaStore.getState().selectedModel;
          const hasCurrent =
            current &&
            status.models.some(
              (m) => m === current || m.startsWith(current.split(":")[0]),
            );
          if (!hasCurrent) {
            setSelectedModel(status.models[0]);
          }
        }
      } catch {
        openOllamaSetup();
      }
    };
    void checkOllama();
  }, [setupComplete, openOllamaSetup, setOllamaLastStatus, setSelectedModel]);

  useEffect(() => {
    if (!activeAddress || addresses.length === 0) {
      closeUnlockDialog();
      return;
    }
    setActiveAddress(activeAddress);
    const check = async () => {
      try {
        const result = await invoke<SessionStatusResult>("session_status", {
          input: { address: activeAddress },
        });
        if (result.locked) {
          setLocked();
          openUnlockDialog();
        } else {
          const expiresAt = result.expiresAtSecs
            ? Date.now() + result.expiresAtSecs * 1000
            : Date.now() + 30 * 60 * 1000;
          setUnlocked(expiresAt);
          closeUnlockDialog();
        }
      } catch {
        setLocked();
        openUnlockDialog();
      }
    };
    void check();
  }, [activeAddress, addresses.length, setActiveAddress, setLocked, setUnlocked, openUnlockDialog, closeUnlockDialog]);

  const handleUnlocked = (expiresAt: number) => {
    setUnlocked(expiresAt);
    closeUnlockDialog();
    setShowBrief(true);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isTypingTarget =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (isTypingTarget) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCommandPalette();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openCommandPalette]);

  const handleReject = () => {
    if (pendingApprovalId === "signal-action") {
      clearPendingApproval();
    } else {
      rejectAction();
    }
    info("Transaction rejected", "The strategy remains in monitoring mode.");
  };

  const handleApprove = async () => {
    if (pendingApprovalId === "signal-action") {
      try {
        await invoke("approve_agent_action", {
          input: {
            toolName: activeSignalToolName,
            payload: activeSignalPayload,
          },
        });
        clearPendingApproval();
      } catch (err) {
        info("Execution failed", String(err));
        return;
      }
    } else {
      await approveAction();
    }
    success("Transaction approved", "SHADOW will execute the private route now.");
    setShowApprovalSuccess(true);
    window.setTimeout(() => setShowApprovalSuccess(false), 1200);
  };

  const modalTransaction = useMemo(() => {
    if (pendingApprovalId === "signal-action" && activeSignalPayload) {
      return {
        id: "signal-action",
        strategyId: "signal",
        action: activeSignalPayload.action || "Execute Signal",
        amount: activeSignalPayload.amount || "N/A",
        chain: activeSignalPayload.chain || "N/A",
        slippage: activeSignalPayload.slippage || "0.5%",
        gas: activeSignalPayload.gasEstimate || "Low",
        reason: activeSignalPayload.reason || "Autonomous signal triggered by ShadowWatcher.",
        executionWindow: "2 mins",
      };
    }
    return pendingApproval;
  }, [pendingApprovalId, activeSignalPayload, pendingApproval]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-3 py-3 text-foreground sm:px-5 sm:py-5 lg:h-screen lg:px-6 lg:py-6">
      <div className="pointer-events-none absolute inset-0 noise-overlay" />
      <div className="relative mx-auto flex max-w-[1600px] min-w-0 flex-1 flex-col lg:h-full lg:min-h-0">
        <MinimalTopBar />
        <MainContent />
      </div>
      <Dock />
      <ActivityBell />
      <Toaster
        position="top-right"
        richColors
        theme={resolvedTheme as "light" | "dark"}
        toastOptions={{
          classNames: {
            toast: "glass-panel",
            title: "text-sm font-semibold text-foreground",
            description: "text-sm text-muted",
          },
        }}
      />
      <NewUpdateCard />
      <PanicModal />
      <ShadowBriefSheet open={showBrief} onOpenChange={setShowBrief} />
      <ApprovalModal
        open={!!pendingApprovalId}
        transaction={modalTransaction}
        onClose={clearPendingApproval}
        onReject={handleReject}
        onApprove={handleApprove}
      />
      <CommandPalette />
      {showUnlockDialog && activeAddress ? (
        <UnlockDialog
          open={showUnlockDialog}
          onOpenChange={(open) => !open && closeUnlockDialog()}
          onUnlocked={handleUnlocked}
          address={activeAddress}
        />
      ) : null}
      <InitializationSequence />
      <OllamaSetup />
      <AnimatePresence>
        {showApprovalSuccess ? (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            className="pointer-events-none fixed right-5 bottom-5 z-50 rounded-sm border border-success/20 bg-success/10 px-4 py-3 text-sm font-semibold text-success shadow-none border border-white/5"
          >
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="size-4" />
              Route approved
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
