import { AnimatePresence, motion } from "framer-motion";
import { MessageSquare } from "lucide-react";
import { useState } from "react";

import { AgentChat } from "@/components/agent/AgentChat";
import { ThreadSidebar } from "@/components/agent/ThreadSidebar";
import { Button } from "@/components/ui/button";
import { useAgentChat } from "@/hooks/useAgentChat";

export function AgentWorkspace() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { activeThread } = useAgentChat();
  const activeTitle = activeThread?.title ?? "New conversation";

  return (
    <div className="flex h-full min-h-0 gap-4 lg:gap-6">
      <aside className="hidden h-full md:block">
        <ThreadSidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex items-center justify-between gap-3 rounded-sm border border-white/10 bg-[#14141a] px-4 py-3 md:hidden">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Open thread list"
            className="gap-2 rounded-sm border border-white/10 bg-white/5 px-4 text-foreground hover:bg-white/10 transition-colors"
            onClick={() => setDrawerOpen(true)}
          >
            <MessageSquare className="size-4" />
            Threads
          </Button>
          <p className="truncate text-sm font-semibold text-foreground tracking-tight">{activeTitle}</p>
        </div>
        <div className="mx-auto flex h-full w-full max-w-[1200px] flex-1 min-h-0 flex-col">
          <AgentChat />
        </div>
      </div>

      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
              onClick={() => setDrawerOpen(false)}
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-y-3 left-3 z-50 w-[280px] md:hidden"
            >
              <ThreadSidebar onClose={() => setDrawerOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
