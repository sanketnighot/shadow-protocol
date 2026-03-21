import { BarChart3, Repeat2, Send, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { usePortfolio } from "@/hooks/usePortfolio";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/useUiStore";
import { useWalletStore } from "@/store/useWalletStore";

const ACTION_ICONS = [Send, Repeat2, Sparkles, BarChart3] as const;

export function QuickActions() {
  const { addresses, activeAddress } = useWalletStore();
  const { quickActions, assets } = usePortfolio({ addresses, activeAddress });
  const navigate = useNavigate();
  const openPortfolioAction = useUiStore((state) => state.openPortfolioAction);

  const handleAction = (label: string) => {
    switch (label) {
      case "Send":
        navigate("/portfolio");
        if (assets.length > 0) {
          openPortfolioAction("send", assets[0].id);
        }
        break;
      case "Swap":
        navigate("/portfolio");
        if (assets.length > 0) {
          openPortfolioAction("swap", assets[0].id);
        }
        break;
      case "Strategy":
        navigate("/strategy");
        break;
      default:
        navigate("/portfolio");
        break;
    }
  };

  return (
    <section aria-label="Quick actions" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {quickActions.map((action, index) => {
        const Icon = ACTION_ICONS[index];

        return (
          <button
            key={action.label}
            type="button"
            aria-label={action.label}
            onClick={() => handleAction(action.label)}
            className={cn(
              "glass-panel group rounded-sm px-5 py-4 text-left transition-transform duration-200 hover:-translate-y-1 active:scale-[0.99]",
            )}
          >
            <div className="flex items-center gap-3">
              <div className="rounded-sm border border-primary/15 bg-primary/10 p-2.5 text-primary">
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
