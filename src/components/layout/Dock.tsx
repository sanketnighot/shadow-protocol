import {
  Blocks,
  Bot,
  Brain,
  Compass,
  Home,
  Sparkles,
  User,
  Wallet,
  Zap,
} from "lucide-react";
import { NavLink } from "react-router-dom";

import { NAV_ITEMS } from "@/data/mock";
import { cn } from "@/lib/utils";

const NAV_ICONS: Record<string, typeof Home> = {
  "/": Home,
  "/agent": Bot,
  "/autonomous": Brain,
  "/apps": Blocks,
  "/strategy": Sparkles,
  "/automation": Zap,
  "/market": Compass,
  "/portfolio": Wallet,
  "/settings": User,
};

type DockProps = {
  onNavigate?: () => void;
};

export function Dock({ onNavigate }: DockProps) {
  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-5 left-1/2 z-30 -translate-x-1/2"
    >
      <div className="glass-panel flex items-center gap-1 rounded-sm px-2 py-2 shadow-none border border-white/5 sm:gap-2 sm:px-3 sm:py-2.5">
        {NAV_ITEMS.map((item) => {
          const Icon = NAV_ICONS[item.href] ?? Home;
          return (
            <NavLink
              key={item.href}
              to={item.href}
              aria-label={item.label}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 rounded-sm px-3 py-2 transition-all sm:px-4 sm:py-2.5",
                  isActive
                    ? "bg-primary/15 text-foreground shadow-none border border-white/5"
                    : "text-muted hover:bg-surface-elevated hover:text-foreground",
                )
              }
            >
              <Icon className="size-5 sm:size-5" aria-hidden />
              <span className="text-[10px] font-medium sm:text-xs">
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
