import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

import { cn } from "@/lib/utils";

type TauriDevContextMenuProps = {
  x: number;
  y: number;
  onClose: () => void;
};

/**
 * Right-click menu: reload webview and open inspector (Tauri dev / developer mode).
 */
export function TauriDevContextMenu({
  x,
  y,
  onClose,
}: TauriDevContextMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const handleReload = () => {
    onClose();
    window.location.reload();
  };

  const handleDevtools = () => {
    onClose();
    void invoke("open_devtools").catch(() => {
      /* ignore */
    });
  };

  const approxWidth = 200;
  const approxHeight = 88;
  const left = Math.min(x, window.innerWidth - approxWidth - 8);
  const top = Math.min(y, window.innerHeight - approxHeight - 8);

  return (
    <div
      ref={rootRef}
      role="menu"
      aria-label="Developer actions"
      className={cn(
        "fixed z-9999 min-w-[200px] overflow-hidden rounded-sm border border-border bg-secondary/95 py-1 shadow-lg backdrop-blur-sm",
      )}
      style={{ left, top }}
    >
      <button
        type="button"
        role="menuitem"
        className="flex w-full px-3 py-2 text-left text-sm text-foreground hover:bg-primary/15"
        onClick={handleReload}
      >
        Reload window
      </button>
      <button
        type="button"
        role="menuitem"
        className="flex w-full px-3 py-2 text-left text-sm text-foreground hover:bg-primary/15"
        onClick={handleDevtools}
      >
        Open DevTools
      </button>
    </div>
  );
}
