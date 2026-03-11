import {
  Bell,
  Bot,
  Compass,
  Home,
  Sparkles,
  User,
  Wallet,
  Zap,
} from "lucide-react";
import { NavLink } from "react-router-dom";

import { NAV_ITEMS } from "@/data/mock";
import { useCountUp } from "@/hooks/useCountUp";
import { usePortfolio } from "@/hooks/usePortfolio";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/useUiStore";

const NAV_ICONS = {
  "/": Home,
  "/agent": Bot,
  "/strategy": Sparkles,
  "/automation": Zap,
  "/market": Compass,
  "/portfolio": Wallet,
  "/settings": User,
} as const;

type SidebarProps = {
  className?: string;
  onNavigate?: () => void;
};

const SETTINGS_NAV_ITEM = NAV_ITEMS.find((item) => item.href === "/settings")!;
const SCROLL_NAV_ITEMS = NAV_ITEMS.filter((item) => item.href !== "/settings");

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const { dailyChangeLabel } = usePortfolio();
  const animatedTotalValue = useCountUp(12345.67);
  const notifications = useUiStore((state) => state.notifications);
  const toggleNotifications = useUiStore((state) => state.toggleNotifications);
  const unreadCount = notifications.filter(
    (notification) => notification.unread,
  ).length;

  return (
    <aside
      className={cn(
        "glass-panel flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border-white/10 pb-0 pl-3 pr-3 pt-3 sm:pl-4 sm:pr-4 sm:pt-4 lg:rounded-[30px]",
        className,
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <div className="flex items-center justify-between gap-3 shrink-0">
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
          <button
            type="button"
            aria-label="Open notifications"
            onClick={toggleNotifications}
            className="relative shrink-0 rounded-full border border-white/10 bg-white/5 p-2.5 text-foreground transition-all hover:bg-white/10 active:scale-95"
          >
            <Bell className="size-4" />
            {unreadCount > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                {unreadCount}
              </span>
            ) : null}
          </button>
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

        <nav className="space-y-2" aria-label="Primary navigation">
          {SCROLL_NAV_ITEMS.map((item) => {
            const Icon = NAV_ICONS[item.href as keyof typeof NAV_ICONS];

            return (
              <NavLink
                key={item.label}
                to={item.href}
                aria-label={item.label}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-[20px] px-3 py-3 transition-all sm:px-4",
                    isActive
                      ? "bg-primary/15 text-foreground shadow-[0_16px_32px_rgba(139,92,246,0.15)]"
                      : "text-muted hover:bg-white/5 hover:text-foreground",
                  )
                }
                onClick={onNavigate}
              >
                <div className="rounded-2xl border border-white/10 bg-white/5 p-2">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold">{item.label}</p>
                  <p className="truncate text-xs text-muted">
                    {item.description}
                  </p>
                </div>
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto shrink-0 border-t border-white/10 pt-3">
        <NavLink
          to={SETTINGS_NAV_ITEM.href}
          aria-label={SETTINGS_NAV_ITEM.label}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-[20px] px-3 transition-all sm:px-4",
              isActive
                ? "bg-primary/15 text-foreground shadow-[0_16px_32px_rgba(139,92,246,0.15)]"
                : "text-muted hover:bg-white/5 hover:text-foreground",
            )
          }
          onClick={onNavigate}
        >
          <div className="rounded-2xl border border-white/10 bg-white/5 p-2">
            <User className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold">{SETTINGS_NAV_ITEM.label}</p>
            <p className="truncate text-xs text-muted">
              {SETTINGS_NAV_ITEM.description}
            </p>
          </div>
        </NavLink>
      </div>
    </aside>
  );
}
