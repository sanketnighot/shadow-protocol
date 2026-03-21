import { type ComponentType, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Compass,
  Home,
  MoonStar,
  Sparkles,
  SunMedium,
  User,
  Wallet,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { type ThemePreference, useUiStore } from "@/store/useUiStore";

type CommandAction = {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  icon: ComponentType<{ className?: string }>;
  onSelect: () => void;
};

const THEME_COMMANDS: ThemePreference[] = ["dark", "light", "system"];

export function CommandPalette() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const closeCommandPalette = useUiStore((state) => state.closeCommandPalette);
  const isCommandPaletteOpen = useUiStore((state) => state.isCommandPaletteOpen);
  const openPortfolioAction = useUiStore((state) => state.openPortfolioAction);
  const setThemePreference = useUiStore((state) => state.setThemePreference);

  const commands = useMemo<CommandAction[]>(
    () => [
      {
        id: "goto-home",
        title: "Go to Home",
        description: "Open the portfolio dashboard.",
        keywords: ["dashboard", "overview", "home"],
        icon: Home,
        onSelect: () => navigate("/"),
      },
      {
        id: "goto-agent",
        title: "Go to Agent",
        description: "Open the private DeFi chat workspace.",
        keywords: ["chat", "agent", "assistant"],
        icon: Bot,
        onSelect: () => navigate("/agent"),
      },
      {
        id: "goto-strategy",
        title: "Go to Strategy Builder",
        description: "Edit triggers, conditions, and actions.",
        keywords: ["builder", "flow", "strategy"],
        icon: Sparkles,
        onSelect: () => navigate("/strategy"),
      },
      {
        id: "goto-automation",
        title: "Go to Automation Center",
        description: "Manage running systems and guardrails.",
        keywords: ["automation", "auto", "strategies"],
        icon: Zap,
        onSelect: () => navigate("/automation"),
      },
      {
        id: "goto-market",
        title: "Go to Market",
        description: "Review live opportunities across chains.",
        keywords: ["market", "yield", "opportunities"],
        icon: Compass,
        onSelect: () => navigate("/market"),
      },
      {
        id: "goto-portfolio",
        title: "Go to Portfolio",
        description: "Inspect cross-chain assets and balances.",
        keywords: ["wallet", "assets", "portfolio"],
        icon: Wallet,
        onSelect: () => navigate("/portfolio"),
      },
      {
        id: "goto-settings",
        title: "Go to Account",
        description: "Change theme and local preferences.",
        keywords: ["account", "settings", "preferences", "theme"],
        icon: User,
        onSelect: () => navigate("/settings"),
      },
      {
        id: "action-send",
        title: "Start Send Flow",
        description: "Open portfolio with a Send action ready.",
        keywords: ["send", "transfer"],
        icon: Wallet,
        onSelect: () => {
          navigate("/portfolio");
          openPortfolioAction("send", "asset-eth");
        },
      },
      {
        id: "action-swap",
        title: "Start Swap Flow",
        description: "Open portfolio with a Swap action ready.",
        keywords: ["swap", "trade"],
        icon: Wallet,
        onSelect: () => {
          navigate("/portfolio");
          openPortfolioAction("swap", "asset-usdc-arb");
        },
      },
      ...THEME_COMMANDS.map((themePreference) => ({
        id: `theme-${themePreference}`,
        title: `Use ${themePreference} theme`,
        description:
          themePreference === "system"
            ? "Follow the current operating system theme."
            : `Switch SHADOW to ${themePreference} mode.`,
        keywords: ["theme", themePreference, "appearance"],
        icon: themePreference === "dark" ? MoonStar : SunMedium,
        onSelect: () => setThemePreference(themePreference),
      })),
    ],
    [navigate, openPortfolioAction, setThemePreference],
  );

  const filteredCommands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return commands;
    }

    return commands.filter((command) => {
      const haystack = [
        command.title,
        command.description,
        ...command.keywords,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [commands, query]);

  useEffect(() => {
    if (!isCommandPaletteOpen) {
      setQuery("");
    }
  }, [isCommandPaletteOpen]);

  return (
    <Dialog open={isCommandPaletteOpen} onOpenChange={(open) => (!open ? closeCommandPalette() : undefined)}>
      <DialogContent
        className="glass-panel left-1/2! top-4! z-50 max-w-[calc(100%-1.5rem)] -translate-x-1/2! translate-y-0! rounded-sm border-white/10 bg-background p-0 text-foreground sm:max-w-2xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="border-b border-white/10 p-4">
          <Input
            autoFocus
            aria-label="Search commands"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search navigation, actions, and theme..."
            className="h-12 rounded-sm border-white/10 bg-white/5 text-foreground placeholder:text-muted"
          />
        </div>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-3">
          {filteredCommands.length > 0 ? (
            filteredCommands.map((command) => {
              const Icon = command.icon;

              return (
                <button
                  key={command.id}
                  type="button"
                  onClick={() => {
                    command.onSelect();
                    closeCommandPalette();
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[22px] border border-transparent px-4 py-3 text-left transition-all hover:border-white/10 hover:bg-white/5 active:scale-[0.99]",
                  )}
                >
                  <div className="rounded-sm border border-primary/15 bg-primary/10 p-2.5 text-primary">
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{command.title}</p>
                    <p className="truncate text-sm text-muted">{command.description}</p>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-6 text-sm text-muted">
              No matching command. Try searching for a route, action, or theme.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
