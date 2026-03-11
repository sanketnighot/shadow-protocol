import { BarChart3, Repeat2, Send, Sparkles } from "lucide-react";

import { usePortfolio } from "@/hooks/usePortfolio";
import { cn } from "@/lib/utils";

const ACTION_ICONS = [Send, Repeat2, Sparkles, BarChart3] as const;

export function QuickActions() {
  const { quickActions } = usePortfolio();

  return (
    <section aria-label="Quick actions" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {quickActions.map((action, index) => {
        const Icon = ACTION_ICONS[index];

        return (
          <button
            key={action.label}
            type="button"
            aria-label={action.label}
            className={cn(
              "glass-panel group rounded-[24px] border-white/10 px-5 py-4 text-left transition-transform duration-200 hover:-translate-y-1",
            )}
          >
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-primary/15 bg-primary/10 p-2.5 text-primary">
                <Icon className="size-4" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{action.label}</p>
                <p className="text-sm text-muted">{action.description}</p>
              </div>
            </div>
          </button>
        );
      })}
    </section>
  );
}
