import { Bell, CheckCircle2, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { type NotificationType, useUiStore } from "@/store/useUiStore";

const NOTIFICATION_STYLES: Record<
  NotificationType,
  { icon: typeof Bell; accent: string }
> = {
  info: { icon: Bell, accent: "text-primary" },
  success: { icon: CheckCircle2, accent: "text-success" },
  warning: { icon: TriangleAlert, accent: "text-warning" },
};

const VISIBLE_MS = 2500;

export function NewUpdateCard() {
  const lastAddedNotificationId = useUiStore((s) => s.lastAddedNotificationId);
  const notifications = useUiStore((s) => s.notifications);
  const clearLastAddedNotification = useUiStore(
    (s) => s.clearLastAddedNotification,
  );
  const [shouldExit, setShouldExit] = useState(false);

  const notification = lastAddedNotificationId
    ? notifications.find((n) => n.id === lastAddedNotificationId)
    : null;

  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setShouldExit(true), VISIBLE_MS);
    return () => clearTimeout(t);
  }, [notification?.id]);

  useEffect(() => {
    if (!lastAddedNotificationId) setShouldExit(false);
  }, [lastAddedNotificationId]);

  if (!notification) return null;

  const { icon: Icon, accent } = NOTIFICATION_STYLES[notification.type];

  const variants = {
    initial: { opacity: 0, y: 16, scale: 0.95 },
    animate: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { duration: 0.3, ease: "easeOut" as const },
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      transition: { duration: 0.2 },
    },
  };

  return (
    <AnimatePresence onExitComplete={clearLastAddedNotification}>
      {!shouldExit && (
        <motion.article
          key={notification.id}
          initial="initial"
          animate="animate"
          exit="exit"
          variants={variants}
          className={cn(
            "fixed bottom-6 right-24 z-50 w-[min(20rem,calc(100vw-3rem))] rounded-sm p-3 shadow-none border border-white/5 glass-panel",
          )}
          style={{ originX: 1, originY: 1 }}
        >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "shrink-0 rounded-sm border border-border bg-surface-elevated p-2",
              accent,
            )}
          >
            <Icon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">{notification.title}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
              {notification.description}
            </p>
          </div>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {notification.createdAtLabel}
          </span>
        </div>
        </motion.article>
      )}
    </AnimatePresence>
  );
}
