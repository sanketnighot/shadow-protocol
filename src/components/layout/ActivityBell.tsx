import {
  Archive,
  Bell,
  Check,
  CheckCircle2,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  type NotificationItem,
  type NotificationType,
  useUiStore,
} from "@/store/useUiStore";
import { useWalletSyncStore } from "@/store/useWalletSyncStore";

const NOTIFICATION_STYLES: Record<
  NotificationType,
  { icon: typeof Bell; accent: string }
> = {
  info: { icon: Bell, accent: "text-primary" },
  success: { icon: CheckCircle2, accent: "text-success" },
  warning: { icon: TriangleAlert, accent: "text-warning" },
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
  const openSignalApproval = useUiStore((s) => s.openSignalApproval);

  return (
    <article
      role={hasRoute ? "button" : undefined}
      tabIndex={hasRoute ? 0 : undefined}
      className={cn(
        "group relative rounded-sm border border-white/5 bg-secondary/50 p-4 transition-colors",
        notification.unread && "border-primary/40 bg-primary/5",
        hasRoute && "cursor-pointer hover:bg-white/5",
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
      <div className="absolute -right-1 -bottom-1 z-10 flex gap-0.5 rounded-sm border border-border bg-surface px-0.5 py-0.5 shadow-none border border-white/5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {notification.unread && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Mark read"
            className="size-6 rounded-sm"
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
          className="size-6 rounded-sm"
          onClick={(e) => {
            e.stopPropagation();
            onArchive();
          }}
        >
          <Archive className="size-3" />
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
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
          </div>
          <span className="shrink-0 text-[10px] text-muted">
            {notification.createdAtLabel}
          </span>
        </div>

        {notification.payload && notification.toolName && (
          <div className="flex justify-end pt-1">
            <Button
              variant="outline"
              size="xs"
              className="rounded-sm border-primary/30 bg-primary/5 text-[10px] font-bold tracking-widest text-primary uppercase hover:bg-primary/10"
              onClick={(e) => {
                e.stopPropagation();
                openSignalApproval(notification.toolName!, notification.payload);
              }}
            >
              Approve & Route
            </Button>
          </div>
        )}
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
  const syncStatus = useWalletSyncStore((s) => s.syncStatus);
  const syncProgress = useWalletSyncStore((s) => s.progress);
  const syncWalletCount = useWalletSyncStore((s) => s.walletCount);
  const markNotificationsRead = useUiStore((s) => s.markNotificationsRead);
  const archiveNotification = useUiStore((s) => s.archiveNotification);
  const archiveAllNotifications = useUiStore((s) => s.archiveAllNotifications);

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
        className="relative flex size-12 items-center justify-center rounded-sm border border-white/10 bg-black text-foreground shadow-none transition-colors hover:bg-white/5"
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span
            className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-sm border border-border bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground"
            aria-label={`${unreadCount} unread updates`}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="absolute bottom-full right-0 mb-3 flex max-h-[60vh] w-[24rem] flex-col overflow-hidden rounded-sm border border-white/10 bg-black shadow-none"
        >
          {syncStatus === "syncing" && (
            <div className="shrink-0 border-b border-white/5 bg-white/5 px-4 py-3">
              <div className="flex items-center gap-3">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span className="font-mono text-[10px] font-bold tracking-wider text-foreground uppercase">
                  Syncing {syncWalletCount > 1 ? `${syncWalletCount} wallets` : "wallet"}
                </span>
              </div>
              <Progress value={syncProgress} className="mt-3 h-1 rounded-none bg-white/5" />
            </div>
          )}
          {notifications.length > 0 && (
            <div className="flex shrink-0 items-center justify-end gap-4 border-b border-white/5 bg-black px-4 py-2">
              <button
                type="button"
                className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase hover:text-foreground"
                onClick={archiveAllNotifications}
              >
                Archive all
              </button>
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase hover:text-foreground"
                  onClick={markNotificationsRead}
                >
                  Mark all read
                </button>
              )}
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-3">
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
