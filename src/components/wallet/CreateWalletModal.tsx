import { useState } from "react";
import { Copy, KeyRound, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/useToast";
import type { CreateWalletResult } from "@/types/wallet";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletSyncStore } from "@/store/useWalletSyncStore";
import { invoke } from "@tauri-apps/api/core";

type CreateWalletModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateWalletModal({ open, onOpenChange }: CreateWalletModalProps) {
  const [wordCount, setWordCount] = useState<12 | 24>(12);
  const [result, setResult] = useState<CreateWalletResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { success } = useToast();
  const refreshWallets = useWalletStore((s) => s.refreshWallets);
  const startSync = useWalletSyncStore((s) => s.startSync);

  const handleCreate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await invoke<CreateWalletResult>("wallet_create", {
        input: { word_count: wordCount },
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create wallet");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyMnemonic = () => {
    if (!result?.mnemonic) return;
    void navigator.clipboard.writeText(result.mnemonic);
    success("Copied", "Recovery phrase copied to clipboard");
  };

  const handleConfirm = () => {
    void refreshWallets();
    if (result?.address) {
      void startSync([result.address]);
    }
    success("Wallet created", `Address: ${result?.address ?? ""}`);
    setResult(null);
    onOpenChange(false);
  };

  const handleClose = () => {
    if (!result) {
      onOpenChange(false);
      return;
    }
    handleConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? handleClose() : undefined)}>
      <DialogContent className="glass-panel max-w-[calc(100%-1.5rem)] rounded-sm border-white/10 bg-background p-5 text-foreground sm:max-w-lg sm:p-6">
        <DialogHeader className="space-y-3 text-left">
          <div className="flex items-center gap-3">
            <div className="rounded-sm border border-primary/20 bg-primary/10 p-2.5 text-primary">
              <KeyRound className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold tracking-[-0.03em]">
                {result ? "Back up your recovery phrase" : "Create new wallet"}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-muted">
                {result
                  ? "Store this phrase securely. SHADOW will not show it again."
                  : "Generate a new EVM wallet. Keys stay on your device."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="rounded-sm border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-500" />
                <p className="text-sm text-amber-200">
                  Never share this phrase. Anyone with it can access your funds.
                </p>
              </div>
            </div>
            <div className="rounded-sm border border-white/10 bg-white/5 p-4 font-mono text-sm leading-relaxed text-foreground">
              {result.mnemonic}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full rounded-sm border-white/10"
              onClick={handleCopyMnemonic}
            >
              <Copy className="mr-2 size-4" />
              Copy phrase
            </Button>
            <p className="text-xs text-muted">
              Address: <span className="font-mono">{result.address}</span>
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">
                Recovery phrase length
              </label>
              <div className="mt-2 flex gap-2">
                {([12, 24] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setWordCount(n)}
                    className={`rounded-sm border px-4 py-2 text-sm transition-all ${
                      wordCount === n
                        ? "border-primary/30 bg-primary/12 text-foreground"
                        : "border-white/10 bg-white/5 text-muted hover:bg-white/8"
                    }`}
                  >
                    {n} words
                  </button>
                ))}
              </div>
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {result ? (
            <Button type="button" className="rounded-sm" onClick={handleConfirm}>
              I've backed it up
            </Button>
          ) : (
            <Button
              type="button"
              className="rounded-sm"
              onClick={() => void handleCreate()}
              disabled={isLoading}
            >
              {isLoading ? "Creating…" : "Create wallet"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
