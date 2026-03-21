import { getCurrentWindow } from "@tauri-apps/api/window";
import { Command, Search } from "lucide-react";
import { type MouseEvent, useCallback, useMemo } from "react";

import { SessionIndicator } from "@/components/wallet/SessionIndicator";
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
        className="relative overflow-hidden rounded-sm border border-white/10 bg-black px-4 py-2.5 shadow-none backdrop-blur-md sm:px-5 lg:px-6"
        onMouseDown={handlePointerDown}
      >
        <div className="relative flex min-h-12 items-center justify-between gap-4">
          <div
            className={`flex min-w-0 items-center gap-4 ${
              isMac ? "pl-[72px] sm:pl-20" : ""
            }`}
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-white/10 bg-white/5 text-xs font-black tracking-[0.24em] text-foreground shadow-none">
              S
            </div>
            <p className="truncate font-mono text-[10px] tracking-[0.3em] text-muted-foreground uppercase">
              SHADOW
            </p>
          </div>

          <div className="flex items-center gap-5">
            <SessionIndicator />
            <button
            type="button"
            onClick={openCommandPalette}
            className="relative z-10 inline-flex items-center gap-3 rounded-sm border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-mono text-muted-foreground transition-all hover:border-white/20 hover:bg-white/10 hover:text-foreground"
          >
            <Search className="size-3.5" />
            <span className="hidden sm:inline tracking-wider">SEARCH</span>
            <span className="inline-flex items-center gap-1 rounded-sm border border-white/10 bg-black/40 px-2 py-0.5 text-[10px] text-muted">
              <Command className="size-2.5" />
              {commandHint}
            </span>
          </button>
          </div>
        </div>
      </div>
    </header>
  );
}
