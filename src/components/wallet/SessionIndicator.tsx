import { invoke } from "@tauri-apps/api/core";
import { Lock, Unlock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/store/useSessionStore";
import { useWalletStore } from "@/store/useWalletStore";

type SessionStatusResult = { locked: boolean; expiresAtSecs?: number };

function formatRemaining(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  if (mins <= 0) return "expired";
  if (mins === 1) return "1 min";
  return `${mins} min`;
}

export function SessionIndicator() {
  const activeAddress = useWalletStore((s) => s.activeAddress);
  const locked = useSessionStore((s) => s.locked);
  const expiresAt = useSessionStore((s) => s.expiresAt);
  const setLocked = useSessionStore((s) => s.setLocked);
  const setUnlocked = useSessionStore((s) => s.setUnlocked);
  const openUnlockDialog = useSessionStore((s) => s.openUnlockDialog);

  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!activeAddress) return;
    try {
      const result = await invoke<SessionStatusResult>("session_status", {
        input: { address: activeAddress },
      });
      if (result.locked) {
        setLocked();
        setRemainingMs(null);
      } else if (result.expiresAtSecs != null) {
        setUnlocked(Date.now() + result.expiresAtSecs * 1000);
        setRemainingMs(result.expiresAtSecs * 1000);
      }
    } catch {
      setLocked();
      setRemainingMs(null);
    }
  }, [activeAddress, setLocked, setUnlocked]);

  useEffect(() => {
    void fetchStatus();
    const id = setInterval(fetchStatus, 60_000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  useEffect(() => {
    if (!expiresAt || locked) {
      setRemainingMs(null);
      return;
    }
    const tick = () => {
      const ms = expiresAt - Date.now();
      setRemainingMs(ms > 0 ? ms : 0);
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, [expiresAt, locked]);

  const handleLock = async () => {
    try {
      // Clear all keys from memory (pass no address = clear_all).
      await invoke("session_lock", { input: {} });
      setLocked();
    } catch {
      // ignore
    }
  };

  if (!activeAddress) return null;

  return (
    <div className="flex items-center gap-2">
      {locked ? (
        <>
          <span className="inline-flex items-center gap-1.5 text-sm text-muted">
            <Lock className="size-4" />
            Locked
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-full text-xs text-muted hover:text-foreground"
            onClick={() => openUnlockDialog()}
          >
            Unlock
          </Button>
        </>
      ) : (
        <>
          <span className="inline-flex items-center gap-1.5 text-sm text-muted">
            <Unlock className="size-4" />
            Unlocked — {remainingMs != null ? formatRemaining(remainingMs) : "—"} remaining
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-full text-xs text-muted hover:text-foreground"
            onClick={() => void handleLock()}
          >
            Lock
          </Button>
        </>
      )}
    </div>
  );
}
