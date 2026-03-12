import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";

import { ActivityBell } from "@/components/layout/ActivityBell";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { Dock } from "@/components/layout/Dock";
import { MainContent } from "@/components/layout/MainContent";
import { NewUpdateCard } from "@/components/layout/NewUpdateCard";
import { OnboardingModal } from "@/components/layout/OnboardingModal";
import { ApprovalModal } from "@/components/shared/ApprovalModal";
import { useAgentChat } from "@/hooks/useAgentChat";
import { useToast } from "@/hooks/useToast";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { useUiStore } from "@/store/useUiStore";

export function AppShell() {
  const [showApprovalSuccess, setShowApprovalSuccess] = useState(false);
  const clearPendingApproval = useUiStore(
    (state) => state.clearPendingApproval,
  );
  const openCommandPalette = useUiStore((state) => state.openCommandPalette);
  const pendingApprovalId = useUiStore((state) => state.pendingApprovalId);
  const themePreference = useUiStore((state) => state.themePreference);
  const completeOnboarding = useOnboardingStore(
    (state) => state.completeOnboarding,
  );
  const hasCompletedOnboarding = useOnboardingStore(
    (state) => state.hasCompletedOnboarding,
  );
  const { pendingApproval } = useAgentChat();
  const { info, success } = useToast();

  useEffect(() => {
    const mediaQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: light)")
        : {
            matches: false,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
          };

    const applyTheme = () => {
      const resolvedTheme =
        themePreference === "system"
          ? mediaQuery.matches
            ? "light"
            : "dark"
          : themePreference;

      document.documentElement.dataset.theme = resolvedTheme;
    };

    applyTheme();
    mediaQuery.addEventListener("change", applyTheme);

    return () => mediaQuery.removeEventListener("change", applyTheme);
  }, [themePreference]);

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
    clearPendingApproval();
    info("Transaction rejected", "The strategy remains in monitoring mode.");
  };

  const handleApprove = () => {
    clearPendingApproval();
    success(
      "Transaction approved",
      "SHADOW will execute the private route now.",
    );
    setShowApprovalSuccess(true);
    window.setTimeout(() => setShowApprovalSuccess(false), 1200);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-3 py-3 text-foreground sm:px-5 sm:py-5 lg:h-screen lg:px-6 lg:py-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_24%),radial-gradient(circle_at_70%_0%,rgba(139,92,246,0.18),transparent_30%)]" />
      <div className="relative mx-auto flex max-w-[1600px] min-w-0 flex-1 flex-col gap-4 lg:h-full lg:min-h-0">
        <MainContent />
      </div>
      <Dock />
      <ActivityBell />
      <NewUpdateCard />
      <ApprovalModal
        open={pendingApprovalId === pendingApproval.id}
        transaction={pendingApproval}
        onClose={clearPendingApproval}
        onReject={handleReject}
        onApprove={handleApprove}
      />
      <CommandPalette />
      <OnboardingModal
        open={!hasCompletedOnboarding}
        onComplete={completeOnboarding}
      />
      <AnimatePresence>
        {showApprovalSuccess ? (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            className="pointer-events-none fixed right-5 bottom-5 z-50 rounded-full border border-emerald-400/15 bg-emerald-400/12 px-4 py-3 text-sm font-semibold text-emerald-200 shadow-[0_18px_40px_rgba(16,185,129,0.22)]"
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
