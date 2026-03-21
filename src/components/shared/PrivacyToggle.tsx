import { ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/useUiStore";

type PrivacyToggleProps = {
  enabled?: boolean;
};

export function PrivacyToggle({ enabled }: PrivacyToggleProps) {
  const privacyModeEnabled = useUiStore((state) => state.privacyModeEnabled);
  const togglePrivacyMode = useUiStore((state) => state.togglePrivacyMode);
  const isEnabled = enabled ?? privacyModeEnabled;

  return (
    <button
      type="button"
      aria-label={isEnabled ? "Private" : "Public"}
      onClick={enabled === undefined ? togglePrivacyMode : undefined}
      className={cn(
        "inline-flex items-center gap-2 rounded-sm border px-3 py-1.5 text-xs font-semibold tracking-[0.18em] uppercase transition-all",
        isEnabled
          ? "border-primary/40 bg-primary/15 text-primary shadow-none border border-white/5"
          : "border-border bg-secondary text-muted",
      )}
    >
      <ShieldCheck className="size-3.5" />
      {isEnabled ? "Private" : "Public"}
    </button>
  );
}
