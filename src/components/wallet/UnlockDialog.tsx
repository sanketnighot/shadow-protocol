import { Fingerprint } from "lucide-react";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SessionUnlockResult = {
  locked: boolean;
  expiresAtSecs?: number;
};

type UnlockDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnlocked: (expiresAt: number) => void;
  address: string;
};

export function UnlockDialog({ open, onOpenChange, onUnlocked, address }: UnlockDialogProps) {
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnlock = async () => {
    if (!address.trim()) return;

    setIsUnlocking(true);
    setError(null);

    try {
      const result = await invoke<SessionUnlockResult>("session_unlock", {
        input: { address: address.trim() },
      });

      if (result.locked) {
        setError("Unlock failed. Please try again.");
        return;
      }

      const expiresAt = result.expiresAtSecs
        ? Date.now() + result.expiresAtSecs * 1000
        : Date.now() + 30 * 60 * 1000;
      onUnlocked(expiresAt);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel max-w-[calc(100%-1.5rem)] rounded-[28px] border-white/10 bg-background p-5 sm:max-w-md sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-[-0.03em]">
            Unlock wallet
          </DialogTitle>
          <DialogDescription className="text-sm text-muted">
            Uses Touch ID when available, otherwise your Mac password. Your key
            stays cached for 30 minutes of inactivity.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-amber-300">{error}</p> : null}
        <DialogFooter className="mt-4">
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-white/10 bg-white/5"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="gap-2 rounded-full px-6"
            disabled={isUnlocking}
            onClick={() => void handleUnlock()}
          >
            {isUnlocking ? (
              "Unlocking…"
            ) : (
              <>
                <Fingerprint className="size-4" />
                Unlock with Touch ID
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
