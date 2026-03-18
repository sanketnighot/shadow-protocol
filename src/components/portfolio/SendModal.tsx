import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import type { Asset } from "@/data/mock";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type SendModalProps = {
  open: boolean;
  asset: Asset | null;
  fromAddress: string | null;
  onClose: () => void;
  onSubmit: (amount: string, address: string, txHash: string) => void;
  onWalletLocked?: () => void;
};

export function SendModal({ open, asset, fromAddress, onClose, onSubmit, onWalletLocked }: SendModalProps) {
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { warning, info } = useToast();

  const validationMessage = useMemo(() => {
    const normalizedAmount = Number(amount);

    if (!asset) {
      return "Missing asset context.";
    }

    if (amount.length === 0 || address.length === 0) {
      return "Enter an amount and recipient address.";
    }

    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return "Amount must be greater than zero.";
    }

    if (address.trim().length < 12) {
      return "Recipient address looks too short.";
    }

    return "";
  }, [address, amount, asset]);

  const displayError = validationMessage || submitError;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? (setSubmitError(null), onClose()) : undefined)}>
      <DialogContent className="glass-panel max-w-[calc(100%-1.5rem)] rounded-[28px] border-white/10 bg-background p-5 text-foreground sm:max-w-lg sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold tracking-[-0.03em]">
            Send {asset?.symbol ?? "asset"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted">
            Transfer {asset?.symbol ?? "asset"} on {asset?.chainName ?? "selected"} to a recipient address.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <label className="grid gap-2 text-sm text-muted">
            Amount
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.currentTarget.value)}
              placeholder={`0.00 ${asset?.symbol ?? ""}`}
              className="h-11 rounded-2xl border-white/10 bg-white/5"
            />
          </label>
          <label className="grid gap-2 text-sm text-muted">
            Recipient
            <Input
              value={address}
              onChange={(event) => setAddress(event.currentTarget.value)}
              placeholder="0x... or supported address"
              className="h-11 rounded-2xl border-white/10 bg-white/5"
            />
          </label>
          <div className="rounded-[20px] border border-white/10 bg-white/5 p-4 text-sm text-muted">
            Network: <span className="font-semibold text-foreground">{asset?.chainName ?? "Unknown"}</span>
          </div>
          {displayError ? (
            <p className="text-sm text-amber-300">{displayError}</p>
          ) : null}
        </div>

        <DialogFooter className="mt-2 gap-3 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-white/10 bg-white/5 text-foreground hover:bg-white/10"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-full px-6"
            disabled={validationMessage.length > 0 || !asset || !fromAddress || isSubmitting}
            onClick={async () => {
              if (!asset || validationMessage || !fromAddress) return;

              setIsSubmitting(true);
              try {
                const { txHash } = await invoke<{ txHash: string }>("portfolio_transfer_background", {
                  input: {
                    fromAddress,
                    toAddress: address.trim(),
                    amount,
                    chain: asset.chain,
                    tokenContract: asset.tokenContract && asset.tokenContract.length > 0 ? asset.tokenContract : null,
                    decimals: asset.decimals ?? 18,
                  },
                });
                setSubmitError(null);
                info("Transfer broadcast", "Confirmation in progress. Check Updates for status.");
                onSubmit(amount, address.trim(), txHash);
                setAmount("");
                setAddress("");
                onClose();
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                if (message.includes("Wallet locked")) {
                  warning("Wallet locked", "Unlock to send.");
                  onWalletLocked?.();
                } else {
                  setSubmitError(message);
                }
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            {isSubmitting ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
