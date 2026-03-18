import { useState } from "react";
import { KeyRound } from "lucide-react";
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
import type { ImportWalletResult } from "@/types/wallet";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletSyncStore } from "@/store/useWalletSyncStore";
import { invoke } from "@tauri-apps/api/core";

type ImportWalletModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ImportTab = "mnemonic" | "private_key";

function isValidMnemonic(mnemonic: string): boolean {
  const words = mnemonic.trim().toLowerCase().split(/\s+/);
  return words.length === 12 || words.length === 24;
}

function isValidPrivateKey(key: string): boolean {
  const s = key.trim().replace(/^0x/i, "");
  return s.length === 64 && /^[0-9a-fA-F]+$/.test(s);
}

export function ImportWalletModal({ open, onOpenChange }: ImportWalletModalProps) {
  const [tab, setTab] = useState<ImportTab>("mnemonic");
  const [mnemonic, setMnemonic] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { success } = useToast();
  const refreshWallets = useWalletStore((s) => s.refreshWallets);
  const startSync = useWalletSyncStore((s) => s.startSync);

  const reset = () => {
    setMnemonic("");
    setPrivateKey("");
    setError(null);
  };

  const handleImport = async () => {
    setError(null);
    if (tab === "mnemonic") {
      if (!isValidMnemonic(mnemonic)) {
        setError("Enter a valid 12- or 24-word recovery phrase");
        return;
      }
      setIsLoading(true);
      try {
        const res = await invoke<ImportWalletResult>("wallet_import_mnemonic", {
          input: { mnemonic: mnemonic.trim() },
        });
        void refreshWallets();
        void startSync([res.address]);
        success("Wallet imported", `Address: ${res.address}`);
        onOpenChange(false);
        reset();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Invalid recovery phrase");
      } finally {
        setIsLoading(false);
      }
    } else {
      if (!isValidPrivateKey(privateKey)) {
        setError("Enter a valid 64-character hex private key (with or without 0x)");
        return;
      }
      setIsLoading(true);
      try {
        const res = await invoke<ImportWalletResult>("wallet_import_private_key", {
          input: { private_key: privateKey.trim() },
        });
        void refreshWallets();
        void startSync([res.address]);
        success("Wallet imported", `Address: ${res.address}`);
        onOpenChange(false);
        reset();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Invalid private key");
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="glass-panel max-w-[calc(100%-1.5rem)] rounded-[28px] border-white/10 bg-background p-5 text-foreground sm:max-w-lg sm:p-6">
        <DialogHeader className="space-y-3 text-left">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-primary/20 bg-primary/10 p-2.5 text-primary">
              <KeyRound className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold tracking-[-0.03em]">
                Import wallet
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-muted">
                Import an existing EVM wallet via recovery phrase or private key.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex rounded-full border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => setTab("mnemonic")}
              className={`flex-1 rounded-full px-4 py-2 text-sm transition-all ${
                tab === "mnemonic"
                  ? "bg-primary/20 text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Recovery phrase
            </button>
            <button
              type="button"
              onClick={() => setTab("private_key")}
              className={`flex-1 rounded-full px-4 py-2 text-sm transition-all ${
                tab === "private_key"
                  ? "bg-primary/20 text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Private key
            </button>
          </div>

          {tab === "mnemonic" ? (
            <textarea
              value={mnemonic}
              onChange={(e) => setMnemonic(e.target.value)}
              placeholder="abandon abandon abandon ..."
              rows={4}
              className="w-full rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          ) : (
            <input
              type="password"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder="0x..."
              className="w-full rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            className="rounded-full"
            onClick={() => void handleImport()}
            disabled={isLoading}
          >
            {isLoading ? "Importing…" : "Import wallet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
