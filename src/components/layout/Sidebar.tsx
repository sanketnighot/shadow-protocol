import { BarChart3, Bot, Home, Settings, Zap } from "lucide-react";
import { NavLink } from "react-router-dom";

import { NAV_ITEMS } from "@/data/mock";
import { cn } from "@/lib/utils";

const NAV_ICONS = [Home, Bot, Zap, BarChart3, Settings] as const;

export function Sidebar() {
  return (
    <aside className="glass-panel rounded-[30px] border-white/10 p-4">
      <nav className="space-y-2" aria-label="Primary navigation">
        {NAV_ITEMS.map((item, index) => {
          const Icon = NAV_ICONS[index];
          const disabled = item.href !== "/" && item.href !== "/agent";

          return (
            <NavLink
              key={item.label}
              to={disabled ? "#" : item.href}
              aria-label={item.label}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-[22px] px-4 py-3 transition-all",
                  disabled
                    ? "cursor-not-allowed opacity-50"
                    : isActive
                      ? "bg-primary/15 text-foreground shadow-[0_16px_32px_rgba(139,92,246,0.15)]"
                      : "text-muted hover:bg-white/5 hover:text-foreground",
                )
              }
              onClick={(event) => {
                if (disabled) {
                  event.preventDefault();
                }
              }}
            >
              <div className="rounded-2xl border border-white/10 bg-white/5 p-2">
                <Icon className="size-4" />
              </div>
              <div>
                <p className="font-semibold">{item.label}</p>
                <p className="text-xs text-muted">{item.description}</p>
              </div>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
