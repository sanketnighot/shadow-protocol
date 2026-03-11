import { useState } from "react";
import {
  Archive,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Inbox,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useCountUp } from "@/hooks/useCountUp";
import { usePortfolio } from "@/hooks/usePortfolio";
import { cn } from "@/lib/utils";
import {
  type NotificationItem,
  useUiStore,
} from "@/store/useUiStore";

const NOTIFICATION_STYLES = {
  info: { icon: Bell, accent: "text-primary" },
  success: { icon: CheckCircle2, accent: "text-emerald-300" },
  warning: { icon: TriangleAlert, accent: "text-amber-300" },
} as const;

type SidebarProps = {
  className?: string;
  /** Called after navigating (e.g. close mobile drawer). */
  onNavigate?: () => void;
};

function NotificationRow({
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
        "group relative rounded-[18px] border border-white/10 bg-white/5 p-3 transition-colors",
        notification.unread && "border-primary/20 bg-primary/5",
        hasRoute && "cursor-pointer hover:bg-white/[0.07]",
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
      <div className="absolute bottom-2 right-2 z-10 flex gap-1 rounded-full border border-white/10 bg-background/95 px-1 py-1 shadow-xl opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {notification.unread && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Mark read"
            className="size-8 rounded-full"
            onClick={(e) => {
              e.stopPropagation();
              onMarkRead();
            }}
          >
            <Check className="size-4" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Archive"
          className="size-8 rounded-full"
          onClick={(e) => {
            e.stopPropagation();
            onArchive();
          }}
        >
          <Archive className="size-4" />
        </Button>
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div
            className={cn(
              "shrink-0 rounded-xl border border-white/10 bg-white/5 p-2",
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

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const navigate = useNavigate();
  const [archivedOpen, setArchivedOpen] = useState(false);
  const { dailyChangeLabel } = usePortfolio();
  const animatedTotalValue = useCountUp(12345.67);
  const notifications = useUiStore((s) => s.notifications);
  const archivedNotifications = useUiStore((s) => s.archivedNotifications);
  const markNotificationRead = useUiStore((s) => s.markNotificationRead);
  const markNotificationsRead = useUiStore((s) => s.markNotificationsRead);
  const archiveNotification = useUiStore((s) => s.archiveNotification);
  const unarchiveNotification = useUiStore((s) => s.unarchiveNotification);
  const removeArchivedNotification = useUiStore((s) => s.removeArchivedNotification);
  const removeAllArchivedNotifications = useUiStore((s) => s.removeAllArchivedNotifications);
  const unreadCount = notifications.filter((n) => n.unread).length;

  const handleOpenNotification = (route: string | undefined) => {
    if (route) {
      navigate(route);
      onNavigate?.();
    }
  };

  return (
    <aside
      className={cn(
        "glass-panel flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border-white/10 pb-0 pl-3 pr-3 pt-3 sm:pl-4 sm:pr-4 sm:pt-4 lg:rounded-[30px]",
        className,
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <div className="shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/12 text-base font-black tracking-[0.24em] text-primary">
              S
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
                SHADOW Protocol
              </p>
              <p className="mt-1 truncate text-sm text-muted">
                Private DeFi workstation
              </p>
            </div>
          </div>
        </div>

        <div className="shrink-0 rounded-[22px] border border-primary/15 bg-primary/8 p-4">
          <p className="text-2xl font-bold tracking-[-0.03em] text-foreground">
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              minimumFractionDigits: 2,
            }).format(animatedTotalValue)}
          </p>
          <p className="mt-1 text-sm text-emerald-300">{dailyChangeLabel}</p>
        </div>

        <section className="flex min-h-0 flex-1 flex-col gap-3" aria-label="Updates">
          <div className="flex shrink-0 items-center justify-between gap-2">
            <p className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">
              Updates
            </p>
            {unreadCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] text-muted hover:text-foreground"
                onClick={markNotificationsRead}
              >
                Mark all read
              </Button>
            )}
          </div>
          <div className="space-y-2 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted">No updates</p>
            ) : (
              notifications.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  onMarkRead={() => markNotificationRead(notification.id)}
                  onArchive={() => archiveNotification(notification.id)}
                  onOpen={() => handleOpenNotification(notification.route)}
                />
              ))
            )}
          </div>
        </section>

        {archivedNotifications.length > 0 && (
          <section className="shrink-0" aria-label="Archived">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-sm text-muted transition-colors hover:bg-white/10 hover:text-foreground"
              onClick={() => setArchivedOpen((o) => !o)}
            >
              <span className="flex items-center gap-2">
                <Inbox className="size-4" />
                Archived ({archivedNotifications.length})
              </span>
              {archivedOpen ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </button>
            {archivedOpen && (
              <div className="mt-2 space-y-2">
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[10px] text-muted hover:text-destructive"
                    onClick={removeAllArchivedNotifications}
                  >
                    Remove all permanently
                  </Button>
                </div>
                {archivedNotifications.map((notification) => (
                  <article
                    key={notification.id}
                    className="group/archived relative rounded-[18px] border border-white/10 bg-white/5 p-3 opacity-80"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete permanently"
                      className="absolute right-2 top-2 size-7 rounded-lg opacity-0 transition-opacity hover:text-destructive group-hover/archived:opacity-100"
                      onClick={() => removeArchivedNotification(notification.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                    <div className="flex items-start gap-3 pr-8">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground">{notification.title}</p>
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted">
                          {notification.description}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-2 h-6 text-[10px] text-muted hover:text-foreground"
                          onClick={() => unarchiveNotification(notification.id)}
                        >
                          Restore
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}
