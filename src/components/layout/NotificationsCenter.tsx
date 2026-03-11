import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCircle2, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/useUiStore";

const NOTIFICATION_STYLES = {
  info: {
    icon: Bell,
    accent: "text-primary",
  },
  success: {
    icon: CheckCircle2,
    accent: "text-emerald-300",
  },
  warning: {
    icon: TriangleAlert,
    accent: "text-amber-300",
  },
} as const;

export function NotificationsCenter() {
  const closeNotifications = useUiStore((state) => state.closeNotifications);
  const isNotificationsOpen = useUiStore((state) => state.isNotificationsOpen);
  const markNotificationsRead = useUiStore((state) => state.markNotificationsRead);
  const notifications = useUiStore((state) => state.notifications);

  useEffect(() => {
    if (isNotificationsOpen) {
      markNotificationsRead();
    }
  }, [isNotificationsOpen, markNotificationsRead]);

  return (
    <AnimatePresence>
      {isNotificationsOpen ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/50"
          onClick={closeNotifications}
        >
          <motion.aside
            initial={{ x: 32, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 32, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute top-0 right-0 h-full w-full max-w-md p-3 sm:p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="glass-panel flex h-full flex-col rounded-[28px] border border-white/10 p-5">
              <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
                    Notifications
                  </p>
                  <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-foreground">
                    Recent automation updates
                  </h2>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full text-foreground hover:bg-white/10"
                  onClick={closeNotifications}
                >
                  <X className="size-4" />
                </Button>
              </div>

              <div className="mt-4 flex-1 space-y-3 overflow-y-auto">
                {notifications.map((notification) => {
                  const { accent, icon: Icon } = NOTIFICATION_STYLES[notification.type];

                  return (
                    <article
                      key={notification.id}
                      className="rounded-[22px] border border-white/10 bg-white/5 p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn("rounded-2xl border border-white/10 bg-white/5 p-2.5", accent)}>
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold text-foreground">{notification.title}</p>
                            <span className="text-xs text-muted">{notification.createdAtLabel}</span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-muted">{notification.description}</p>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
