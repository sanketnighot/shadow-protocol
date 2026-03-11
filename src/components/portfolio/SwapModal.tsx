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

type SwapModalProps = {
  open: boolean;
  asset: Asset | null;
  onClose: () => void;
  onSubmit: (amount: string, targetSymbol: string) => void;
};

export function SwapModal({ open, asset, onClose, onSubmit }: SwapModalProps) {
  const [amount, setAmount] = useState("");
  const [targetSymbol, setTargetSymbol] = useState("ETH");

  const validationMessage = useMemo(() => {
    const normalizedAmount = Number(amount);

    if (!asset) {
      return "Missing asset context.";
    }

    if (amount.length === 0 || targetSymbol.trim().length === 0) {
      return "Enter an amount and output asset.";
    }

    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return "Amount must be greater than zero.";
    }

    if (targetSymbol.trim().length < 2 || targetSymbol.trim().length > 10) {
      return "Output asset symbol must be between 2 and 10 characters.";
    }

    if (targetSymbol.trim().toUpperCase() === asset.symbol.toUpperCase()) {
      return "Choose a different destination asset.";
    }

    return "";
  }, [amount, asset, targetSymbol]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <DialogContent className="glass-panel max-w-[calc(100%-1.5rem)] rounded-[28px] border-white/10 bg-background p-5 text-foreground sm:max-w-lg sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold tracking-[-0.03em]">
            Swap {asset?.symbol ?? "asset"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted">
            Prepare a local quote request with a destination token and amount.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <label className="grid gap-2 text-sm text-muted">
            Sell amount
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.currentTarget.value)}
              placeholder={`0.00 ${asset?.symbol ?? ""}`}
              className="h-11 rounded-2xl border-white/10 bg-white/5"
            />
          </label>
          <label className="grid gap-2 text-sm text-muted">
            Buy token
            <Input
              value={targetSymbol}
              onChange={(event) => setTargetSymbol(event.currentTarget.value.toUpperCase())}
              placeholder="ETH"
              className="h-11 rounded-2xl border-white/10 bg-white/5"
            />
          </label>
          <div className="rounded-[20px] border border-white/10 bg-white/5 p-4 text-sm text-muted">
            Route source: <span className="font-semibold text-foreground">{asset?.chainName ?? "Unknown"}</span>
          </div>
          {validationMessage ? (
            <p className="text-sm text-amber-300">{validationMessage}</p>
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
            disabled={validationMessage.length > 0 || !asset}
            onClick={() => {
              if (!asset || validationMessage) {
                return;
              }

              onSubmit(amount, targetSymbol.trim().toUpperCase());
              setAmount("");
            }}
          >
            Preview route
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
