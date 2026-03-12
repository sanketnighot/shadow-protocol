import { AnimatePresence, motion } from "framer-motion";
import { Outlet, useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";

export function MainContent() {
  const location = useLocation();
  const isAgentPage = location.pathname === "/agent";

  return (
    <main
      className={cn(
        "flex-1 min-h-0 min-w-0 overflow-y-auto",
        isAgentPage
          ? "pt-3 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:pb-[calc(8rem+env(safe-area-inset-bottom))]"
          : "pt-6 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:pb-[calc(9rem+env(safe-area-inset-bottom))]",
      )}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className={isAgentPage ? "h-full" : "min-h-full"}
        >
          <Outlet />
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
