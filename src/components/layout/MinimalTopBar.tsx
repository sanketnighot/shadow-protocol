import { getCurrentWindow } from "@tauri-apps/api/window";
import { Command, Search } from "lucide-react";
import { type MouseEvent, useCallback, useMemo } from "react";

import { useUiStore } from "@/store/useUiStore";

export function MinimalTopBar() {
  const openCommandPalette = useUiStore((state) => state.openCommandPalette);

  const isMac = useMemo(() => {
    if (typeof navigator === "undefined") {
      return false;
    }

    return /mac/i.test(navigator.userAgent);
  }, []);

  const handlePointerDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      const target = event.target;
      if (target instanceof HTMLElement && target.closest("button")) {
        return;
      }

      void getCurrentWindow().startDragging();
    },
    [],
  );

  const commandHint = useMemo(() => {
    if (typeof navigator === "undefined") {
      return "Cmd+K";
    }

    return /mac/i.test(navigator.userAgent) ? "Cmd+K" : "Ctrl+K";
  }, []);

  return (
    <header className="shrink-0 pb-3">
      <div
        className="relative overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,26,0.96),rgba(14,14,20,0.9))] px-4 py-2.5 shadow-[0_20px_56px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:px-5 lg:px-6"
        onMouseDown={handlePointerDown}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_0%,rgba(139,92,246,0.16),transparent_42%),linear-gradient(90deg,transparent,rgba(139,92,246,0.08),transparent)]" />
        <div className="relative flex min-h-12 items-center justify-between gap-4">
          <div
            className={`flex min-w-0 items-center gap-3 ${
              isMac ? "pl-[72px] sm:pl-20" : ""
            }`}
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/12 text-xs font-black tracking-[0.24em] text-primary shadow-[0_0_24px_rgba(139,92,246,0.16)] sm:size-9">
              S
            </div>
            <p className="truncate font-mono text-[11px] tracking-[0.28em] text-muted uppercase">
              SHADOW
            </p>
          </div>

          <button
            type="button"
            onClick={openCommandPalette}
            className="relative z-10 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-sm text-muted transition-all hover:border-white/15 hover:bg-white/10 hover:text-foreground"
          >
            <Search className="size-4" />
            <span className="hidden sm:inline">Search</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-xs text-muted">
              <Command className="size-3" />
              {commandHint}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
