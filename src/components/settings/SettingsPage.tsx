import packageJson from "../../../package.json";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type ThemePreference, useUiStore } from "@/store/useUiStore";

const THEME_OPTIONS: ThemePreference[] = ["dark", "light", "system"];

export function SettingsPage() {
  const themePreference = useUiStore((state) => state.themePreference);
  const setThemePreference = useUiStore((state) => state.setThemePreference);
  const openCommandPalette = useUiStore((state) => state.openCommandPalette);

  return (
    <div className="space-y-6">
      <section className="glass-panel rounded-[24px] border border-white/10 p-5 sm:p-6">
        <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
          Account
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-foreground">
          Appearance & shortcuts
        </h1>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <section className="glass-panel rounded-[24px] border border-white/10 p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-foreground">Theme</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Choose the theme that matches your environment.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setThemePreference(option)}
                className={cn(
                  "rounded-[20px] border px-4 py-4 text-left transition-all hover:-translate-y-0.5 active:scale-95",
                  themePreference === option
                    ? "border-primary/30 bg-primary/12 text-foreground shadow-[0_16px_32px_rgba(139,92,246,0.14)]"
                    : "border-white/10 bg-white/5 text-muted hover:bg-white/8",
                )}
              >
                <p className="font-semibold capitalize">{option}</p>
                <p className="mt-2 text-sm leading-6">
                  {option === "system"
                    ? "Follow your macOS or Windows preference automatically."
                    : `Keep SHADOW in ${option} mode across launches.`}
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className="glass-panel rounded-[24px] border border-white/10 p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-foreground">Command palette</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Open anywhere with <span className="font-mono">Cmd/Ctrl + K</span>.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 rounded-full border-white/10 bg-white/5 text-foreground hover:bg-white/10"
            onClick={openCommandPalette}
          >
            Open command palette
          </Button>
        </section>
      </div>

      <section className="glass-panel rounded-[24px] border border-white/10 p-5 sm:p-6">
        <h2 className="text-xl font-semibold text-foreground">About</h2>
        <div className="mt-5">
          <div className="rounded-[20px] border border-white/10 bg-white/5 p-4 max-w-xs">
            <p className="text-xs tracking-[0.18em] text-muted uppercase">Version</p>
            <p className="mt-2 font-semibold text-foreground">v{packageJson.version}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
