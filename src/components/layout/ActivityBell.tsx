import {
  Archive,
  Bell,
  Check,
  CheckCircle2,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type NotificationItem,
  type NotificationType,
  useUiStore,
} from "@/store/useUiStore";

const NOTIFICATION_STYLES: Record<
  NotificationType,
  { icon: typeof Bell; accent: string }
> = {
  info: { icon: Bell, accent: "text-primary" },
  success: { icon: CheckCircle2, accent: "text-emerald-300" },
  warning: { icon: TriangleAlert, accent: "text-amber-300" },
};

const CLOSE_DELAY_MS = 200;

function NotificationCard({
  notification,
  onMarkRead,
  onArchive,
  onOpen,
}: {
  notification: NotificationItem;
  onMarkRead: () => void;
  onArchive: () => void;
  onOpen: () => void;
}) {
  const { icon: Icon, accent } = NOTIFICATION_STYLES[notification.type];
  const hasRoute = notification.route != null && notification.route !== "";
  return (
    <article
      role={hasRoute ? "button" : undefined}
      tabIndex={hasRoute ? 0 : undefined}
      className={cn(
        "group relative rounded-[18px] border border-white/10 bg-[#14141a] p-3 transition-colors",
        notification.unread && "border-primary/20 bg-[#18141f]",
        hasRoute && "cursor-pointer hover:bg-[#1a1a24]",
      )}
      onClick={hasRoute ? onOpen : undefined}
      onKeyDown={
        hasRoute
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
    >
      <div className="absolute -right-1 -bottom-1 z-10 flex gap-0.5 rounded-full border border-white/10 bg-background/95 px-0.5 py-0.5 shadow-xl opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {notification.unread && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Mark read"
            className="size-6 rounded-full"
            onClick={(e) => {
              e.stopPropagation();
              onMarkRead();
            }}
          >
            <Check className="size-3" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Archive"
          className="size-6 rounded-full"
          onClick={(e) => {
            e.stopPropagation();
            onArchive();
          }}
        >
          <Archive className="size-3" />
        </Button>
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div
            className={cn(
              "shrink-0 rounded-xl border border-white/10 bg-white/10 p-2",
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
        </div>
        <span className="shrink-0 text-[10px] text-muted">
          {notification.createdAtLabel}
        </span>
      </div>
    </article>
  );
}

export function ActivityBell() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notifications = useUiStore((s) => s.notifications);
  const markNotificationRead = useUiStore((s) => s.markNotificationRead);
  const markNotificationsRead = useUiStore((s) => s.markNotificationsRead);
  const archiveNotification = useUiStore((s) => s.archiveNotification);

  const unreadCount = notifications.filter((n) => n.unread).length;

  const handleOpen = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
      closeTimerRef.current = null;
    }, CLOSE_DELAY_MS);
  }, []);

  const handleOpenNotification = useCallback(
    (route: string | undefined) => {
      if (route) {
        navigate(route);
      }
    },
    [navigate],
  );

  return (
    <div
      className="fixed bottom-6 right-6 z-40"
      onMouseEnter={handleOpen}
      onMouseLeave={handleClose}
    >
      <button
        type="button"
        aria-label="Open updates"
        aria-expanded={isOpen}
        className="relative flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-black/70 text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur transition-colors hover:bg-black/85 hover:shadow-[0_12px_32px_rgba(0,0,0,0.6)]"
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span
            className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full border border-white/10 bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground"
            aria-label={`${unreadCount} unread updates`}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="absolute bottom-full right-0 mb-2 flex max-h-[50vh] w-[min(22rem,90vw)] flex-col overflow-hidden rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 40%, rgba(0,0,0,0) 100%)",
          }}
        >
          {unreadCount > 0 && (
            <button
              type="button"
              className="absolute right-3 top-2 z-10 text-[10px] text-muted hover:text-foreground"
              onClick={markNotificationsRead}
            >
              Mark all read
            </button>
          )}
          <div className="flex-1 overflow-y-auto p-3 pt-8">
            {notifications.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted">
                No updates
              </p>
            ) : (
              <div className="space-y-2">
                {notifications.map((notification) => (
                  <NotificationCard
                    key={notification.id}
                    notification={notification}
                    onMarkRead={() => markNotificationRead(notification.id)}
                    onArchive={() => archiveNotification(notification.id)}
                    onOpen={() =>
                      handleOpenNotification(notification.route)
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
