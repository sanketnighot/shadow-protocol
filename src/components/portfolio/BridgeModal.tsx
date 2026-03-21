import { useMemo, useState } from "react";

import type { Asset } from "@/data/mock";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const DESTINATION_CHAINS = ["Ethereum", "Arbitrum", "Base", "Solana"] as const;

type BridgeModalProps = {
  open: boolean;
  asset: Asset | null;
  onClose: () => void;
  onSubmit: (amount: string, destinationChain: string) => void;
};

export function BridgeModal({ open, asset, onClose, onSubmit }: BridgeModalProps) {
  const [amount, setAmount] = useState("");
  const [destinationChain, setDestinationChain] = useState("Ethereum");

  const validationMessage = useMemo(() => {
    const normalizedAmount = Number(amount);

    if (!asset) {
      return "Missing asset context.";
    }

    if (amount.length === 0) {
      return "Enter an amount to bridge.";
    }

    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return "Amount must be greater than zero.";
    }

    if (destinationChain === asset.chainName) {
      return "Choose a different destination chain.";
    }

    return "";
  }, [amount, asset, destinationChain]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <DialogContent className="glass-panel max-w-[calc(100%-1.5rem)] rounded-[28px] bg-background p-5 text-foreground sm:max-w-lg sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold tracking-[-0.03em]">
            Bridge {asset?.symbol ?? "asset"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted">
            Prepare a cross-chain move without leaving the workstation.
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
              className="h-11 rounded-2xl border-border bg-secondary"
            />
          </label>
          <label className="grid gap-2 text-sm text-muted">
            Destination chain
            <select
              aria-label="Destination chain"
              value={destinationChain}
              onChange={(event) => setDestinationChain(event.currentTarget.value)}
              className="h-11 rounded-2xl border border-border bg-secondary px-3 text-foreground outline-none"
            >
              {DESTINATION_CHAINS.map((chain) => (
                <option key={chain} value={chain}>
                  {chain}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-[20px] border border-border bg-secondary p-4 text-sm text-muted">
            Origin: <span className="font-semibold text-foreground">{asset?.chainName ?? "Unknown"}</span>
          </div>
          {validationMessage ? (
            <p className="text-sm text-amber-300">{validationMessage}</p>
          ) : null}
        </div>

        <DialogFooter className="mt-2 gap-3 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-border bg-secondary text-foreground hover:bg-surface-elevated"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-full px-6"
            disabled={validationMessage.length > 0 || !asset}
            onClick={() => {
              if (!asset || validationMessage) {
                return;
              }

              onSubmit(amount, destinationChain);
              setAmount("");
            }}
          >
            Preview bridge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
