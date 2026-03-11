import { AnimatePresence, motion } from "framer-motion";
import { Menu } from "lucide-react";

import { ApprovalModal } from "@/components/shared/ApprovalModal";
import { MainContent } from "@/components/layout/MainContent";
import { Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { useAgentChat } from "@/hooks/useAgentChat";
import { useToast } from "@/hooks/useToast";
import { useUiStore } from "@/store/useUiStore";

export function AppShell() {
  const clearPendingApproval = useUiStore((state) => state.clearPendingApproval);
  const closeSidebar = useUiStore((state) => state.closeSidebar);
  const isSidebarOpen = useUiStore((state) => state.isSidebarOpen);
  const pendingApprovalId = useUiStore((state) => state.pendingApprovalId);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const { pendingApproval } = useAgentChat();
  const { info, success } = useToast();

  const handleReject = () => {
    clearPendingApproval();
    info("Transaction rejected", "The strategy remains in monitoring mode.");
  };

  const handleApprove = () => {
    clearPendingApproval();
    success("Transaction approved", "SHADOW will execute the private route now.");
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-3 py-3 text-foreground sm:px-5 sm:py-5 lg:h-screen lg:px-6 lg:py-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_24%),radial-gradient(circle_at_70%_0%,rgba(139,92,246,0.18),transparent_30%)]" />
      <div className="relative mx-auto flex max-w-[1600px] min-w-0 flex-col gap-4 lg:h-full">
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
        <div className="grid min-w-0 gap-4 lg:h-full lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-5">
          <Sidebar className="hidden lg:block lg:h-full lg:overflow-y-auto" />
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
    </div>
  );
}
