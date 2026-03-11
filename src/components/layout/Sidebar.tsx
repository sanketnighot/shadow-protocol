import { Bell, Bot, Compass, Home, Settings, Sparkles, Wallet, Zap } from "lucide-react";
import { NavLink } from "react-router-dom";

import { NAV_ITEMS } from "@/data/mock";
import { PrivacyToggle } from "@/components/shared/PrivacyToggle";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { useAgentChat } from "@/hooks/useAgentChat";
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
  "/settings": Settings,
} as const;

type SidebarProps = {
  className?: string;
  onNavigate?: () => void;
};

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const { dailyChangeLabel } = usePortfolio();
  const { latestActivityLabel, suggestion } = useAgentChat();
  const animatedTotalValue = useCountUp(12345.67);
  const notifications = useUiStore((state) => state.notifications);
  const toggleNotifications = useUiStore((state) => state.toggleNotifications);
  const unreadCount = notifications.filter((notification) => notification.unread).length;

  return (
    <aside
      className={cn(
        "glass-panel rounded-[24px] border-white/10 p-3 sm:p-4 lg:rounded-[30px]",
        className,
      )}
    >
      <div className="flex h-full min-h-0 flex-col gap-5">
        <div className="space-y-4 border-b border-white/10 pb-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
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
              className="relative rounded-full border border-white/10 bg-white/5 p-2.5 text-foreground transition-all hover:bg-white/10 active:scale-95"
            >
              <Bell className="size-4" />
              {unreadCount > 0 ? (
                <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  {unreadCount}
                </span>
              ) : null}
            </button>
          </div>

          <div className="rounded-[22px] border border-primary/15 bg-primary/8 p-4">
            <p className="text-xs tracking-[0.18em] text-muted uppercase">
              Live operations
            </p>
            <p className="mt-3 text-2xl font-bold tracking-[-0.03em] text-foreground">
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
                minimumFractionDigits: 2,
              }).format(animatedTotalValue)}
            </p>
            <p className="mt-1 text-sm text-emerald-300">{dailyChangeLabel}</p>
            <p className="mt-4 text-sm leading-6 text-muted">
              {suggestion.title}
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-[20px] border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <p className="text-xs tracking-[0.18em] text-muted uppercase">Privacy mode</p>
              <p className="mt-1 text-sm text-foreground">Agent-safe default</p>
            </div>
            <PrivacyToggle />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-[20px] border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <p className="text-xs tracking-[0.18em] text-muted uppercase">Theme</p>
              <p className="mt-1 text-sm text-foreground">Cycle dark, light, or system</p>
            </div>
            <ThemeToggle />
          </div>
        </div>

        <nav className="space-y-2" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
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
                  <p className="truncate text-xs text-muted">{item.description}</p>
                </div>
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3 border-t border-white/10 pt-5">
          <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
            <p className="text-xs tracking-[0.18em] text-muted uppercase">Latest action</p>
            <p className="mt-2 text-sm leading-6 text-foreground/90">
              {latestActivityLabel}
            </p>
          </div>
          <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
            <p className="text-xs tracking-[0.18em] text-muted uppercase">Current focus</p>
            <p className="mt-2 text-sm leading-6 text-muted">{suggestion.summary}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
