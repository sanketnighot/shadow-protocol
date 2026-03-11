import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Menu } from "lucide-react";

import { ApprovalModal } from "@/components/shared/ApprovalModal";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { MainContent } from "@/components/layout/MainContent";
import { NotificationsCenter } from "@/components/layout/NotificationsCenter";
import { OnboardingModal } from "@/components/layout/OnboardingModal";
import { Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { useAgentChat } from "@/hooks/useAgentChat";
import { useToast } from "@/hooks/useToast";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { useUiStore } from "@/store/useUiStore";

export function AppShell() {
  const [showApprovalSuccess, setShowApprovalSuccess] = useState(false);
  const clearPendingApproval = useUiStore((state) => state.clearPendingApproval);
  const closeSidebar = useUiStore((state) => state.closeSidebar);
  const isSidebarOpen = useUiStore((state) => state.isSidebarOpen);
  const openCommandPalette = useUiStore((state) => state.openCommandPalette);
  const pendingApprovalId = useUiStore((state) => state.pendingApprovalId);
  const themePreference = useUiStore((state) => state.themePreference);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const completeOnboarding = useOnboardingStore((state) => state.completeOnboarding);
  const hasCompletedOnboarding = useOnboardingStore((state) => state.hasCompletedOnboarding);
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
    success("Transaction approved", "SHADOW will execute the private route now.");
    setShowApprovalSuccess(true);
    window.setTimeout(() => setShowApprovalSuccess(false), 1200);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-3 py-3 text-foreground sm:px-5 sm:py-5 lg:h-screen lg:px-6 lg:py-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_24%),radial-gradient(circle_at_70%_0%,rgba(139,92,246,0.18),transparent_30%)]" />
      <div className="relative mx-auto flex max-w-[1600px] min-w-0 flex-col gap-4 lg:h-full lg:min-h-0">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Open navigation"
          className="fixed top-4 left-4 z-40 rounded-full border border-white/10 bg-black/40 text-foreground backdrop-blur lg:hidden"
          onClick={toggleSidebar}
        >
          <Menu className="size-4" />
        </Button>
        <div className="grid min-w-0 flex-1 gap-4 lg:min-h-0 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-5">
          <div className="hidden lg:flex lg:h-full lg:min-h-0">
            <Sidebar className="h-full w-full" />
          </div>
          <MainContent />
        </div>
      </div>
      <AnimatePresence>
        {isSidebarOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 lg:hidden"
            onClick={closeSidebar}
          >
            <motion.div
              initial={{ x: -28, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -28, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="h-full w-[min(22rem,88vw)] p-3"
              onClick={(event) => event.stopPropagation()}
            >
              <Sidebar className="h-full overflow-y-auto" onNavigate={closeSidebar} />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <ApprovalModal
        open={pendingApprovalId === pendingApproval.id}
        transaction={pendingApproval}
        onClose={clearPendingApproval}
        onReject={handleReject}
        onApprove={handleApprove}
      />
      <CommandPalette />
      <NotificationsCenter />
      <OnboardingModal open={!hasCompletedOnboarding} onComplete={completeOnboarding} />
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
