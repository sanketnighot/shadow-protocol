import { LaptopMinimal, MoonStar, SunMedium } from "lucide-react";

import { cn } from "@/lib/utils";
import { type ThemePreference, useUiStore } from "@/store/useUiStore";

const THEME_SEQUENCE: ThemePreference[] = ["dark", "light", "system"];

const THEME_META = {
  dark: {
    icon: MoonStar,
    label: "Dark",
  },
  light: {
    icon: SunMedium,
    label: "Light",
  },
  system: {
    icon: LaptopMinimal,
    label: "System",
  },
} as const;

export function ThemeToggle() {
  const themePreference = useUiStore((state) => state.themePreference);
  const setThemePreference = useUiStore((state) => state.setThemePreference);
  const currentIndex = THEME_SEQUENCE.indexOf(themePreference);
  const nextTheme = THEME_SEQUENCE[(currentIndex + 1) % THEME_SEQUENCE.length];
  const { icon: Icon, label } = THEME_META[themePreference];

  return (
    <button
      type="button"
      aria-label={`Theme: ${label}. Switch to ${THEME_META[nextTheme].label}.`}
      onClick={() => setThemePreference(nextTheme)}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold tracking-[0.18em] uppercase text-foreground transition-all hover:bg-white/10 active:scale-95",
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}
