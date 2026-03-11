import { Bot, Home, Settings, Sparkles, Wallet, Zap } from "lucide-react";
import { NavLink } from "react-router-dom";

import { NAV_ITEMS } from "@/data/mock";
import { cn } from "@/lib/utils";

const NAV_ICONS = [Home, Bot, Sparkles, Zap, Wallet, Settings] as const;

type SidebarProps = {
  className?: string;
  onNavigate?: () => void;
};

export function Sidebar({ className, onNavigate }: SidebarProps) {
  return (
    <aside className={cn("glass-panel rounded-[24px] border-white/10 p-3 sm:p-4 lg:rounded-[30px]", className)}>
      <nav className="space-y-2" aria-label="Primary navigation">
        {NAV_ITEMS.map((item, index) => {
          const Icon = NAV_ICONS[index];

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
    </aside>
  );
}
