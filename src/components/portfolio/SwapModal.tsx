import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

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
import { useWalletStore } from "@/store/useWalletStore";
import { hasTauriRuntime } from "@/lib/tauri";

type QuoteResult = {
  to: string;
  data: string;
  value: string;
  gasEstimate: string;
  buyAmount: string;
  minBuyAmount: string;
  priceImpact: string;
};

type SwapModalProps = {
  open: boolean;
  asset: Asset | null;
  onClose: () => void;
  onSubmit: (amount: string, targetSymbol: string) => void;
};

export function SwapModal({ open, asset, onClose, onSubmit }: SwapModalProps) {
  const [amount, setAmount] = useState("");
  const [targetSymbol, setTargetSymbol] = useState("ETH");
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const { activeAddress } = useWalletStore();

  const validationMessage = useMemo(() => {
    const normalizedAmount = Number(amount);
    if (!asset) return "Missing asset context.";
    if (amount.length === 0 || targetSymbol.trim().length === 0) return "Enter an amount and output asset.";
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) return "Amount must be greater than zero.";
    if (targetSymbol.trim().length < 2 || targetSymbol.trim().length > 10) return "Output asset symbol must be 2–10 characters.";
    if (targetSymbol.trim().toUpperCase() === asset.symbol.toUpperCase()) return "Choose a different destination asset.";
    return "";
  }, [amount, asset, targetSymbol]);

  const handlePreview = async () => {
    if (!asset || validationMessage || !hasTauriRuntime) return;

    const decimals = asset.decimals ?? 18;
    const amountF = parseFloat(amount);
    const sellAmountWei = Math.floor(amountF * 10 ** decimals).toString();

    setIsFetchingQuote(true);
    setQuote(null);
    setQuoteError(null);

    try {
      const result = await invoke<QuoteResult>("swap_get_quote", {
        input: {
          fromToken: asset.tokenContract || asset.symbol,
          toToken: targetSymbol.trim().toUpperCase(),
          sellAmountWei,
          chain: asset.chain,
          slippageBps: 50,
          takerAddress: activeAddress ?? "",
        },
      });
      setQuote(result);
    } catch (e) {
      setQuoteError(String(e));
    } finally {
      setIsFetchingQuote(false);
    }
  };

  const handleExecute = async () => {
    if (!asset || !quote || !activeAddress || !hasTauriRuntime) return;

    const decimals = asset.decimals ?? 18;
    const amountF = parseFloat(amount);
    const sellAmountWei = Math.floor(amountF * 10 ** decimals).toString();

    setIsExecuting(true);
    try {
      await invoke<{ txHash: string; buyAmount: string }>("swap_execute", {
        input: {
          fromAddress: activeAddress,
          fromToken: asset.tokenContract || asset.symbol,
          toToken: targetSymbol.trim().toUpperCase(),
          sellAmountWei,
          chain: asset.chain,
          slippageBps: 50,
        },
      });
      onSubmit(amount, targetSymbol.trim().toUpperCase());
      setAmount("");
      setQuote(null);
    } catch (e) {
      setQuoteError(String(e));
    } finally {
      setIsExecuting(false);
    }
  };

  const handleClose = () => {
    setAmount("");
    setTargetSymbol("ETH");
    setQuote(null);
    setQuoteError(null);
    onClose();
  };

  const buyAmountDisplay = quote
    ? `~${(parseInt(quote.buyAmount) / 1e18).toFixed(6)} ${targetSymbol.toUpperCase()}`
    : null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? handleClose() : undefined)}>
      <DialogContent className="glass-panel max-w-[calc(100%-1.5rem)] rounded-sm bg-background p-5 text-foreground sm:max-w-lg sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold tracking-[-0.03em]">
            Swap {asset?.symbol ?? "asset"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted">
            {quote ? "Review the quote below, then confirm to execute on-chain." : "Get a live quote via 0x and execute on-chain."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <label className="grid gap-2 text-sm text-muted">
            Sell amount
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(event) => { setAmount(event.currentTarget.value); setQuote(null); setQuoteError(null); }}
              placeholder={`0.00 ${asset?.symbol ?? ""}`}
              className="h-11 rounded-sm border-border bg-secondary"
              disabled={isExecuting}
            />
          </label>
          <label className="grid gap-2 text-sm text-muted">
            Buy token
            <Input
              value={targetSymbol}
              onChange={(event) => { setTargetSymbol(event.currentTarget.value.toUpperCase()); setQuote(null); setQuoteError(null); }}
              placeholder="ETH"
              className="h-11 rounded-sm border-border bg-secondary"
              disabled={isExecuting}
            />
          </label>

          {quote && (
            <div className="rounded-sm border border-emerald-500/20 bg-emerald-500/8 p-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">You receive</span>
                <span className="font-semibold text-foreground">{buyAmountDisplay}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Price impact</span>
                <span className="text-foreground">{quote.priceImpact === "unknown" ? "—" : `${quote.priceImpact}%`}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Gas estimate</span>
                <span className="text-foreground">{quote.gasEstimate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Network</span>
                <span className="text-foreground">{asset?.chainName}</span>
              </div>
            </div>
          )}

          {!quote && (
            <div className="rounded-sm border border-border bg-secondary p-4 text-sm text-muted">
              Route source: <span className="font-semibold text-foreground">{asset?.chainName ?? "Unknown"}</span>
            </div>
          )}

          {validationMessage && <p className="text-sm text-amber-300">{validationMessage}</p>}
          {quoteError && <p className="text-sm text-red-400">{quoteError}</p>}
        </div>

        <DialogFooter className="mt-2 gap-3 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="rounded-sm border-border bg-secondary text-foreground hover:bg-surface-elevated"
            onClick={handleClose}
            disabled={isExecuting}
          >
            Cancel
          </Button>
          {!quote ? (
            <Button
              type="button"
              className="rounded-sm px-6"
              disabled={validationMessage.length > 0 || !asset || isFetchingQuote}
              onClick={handlePreview}
            >
              {isFetchingQuote ? "Getting quote…" : "Preview"}
            </Button>
          ) : (
            <Button
              type="button"
              className="rounded-sm bg-emerald-600 px-6 hover:bg-emerald-700"
              disabled={isExecuting}
              onClick={handleExecute}
            >
              {isExecuting ? "Executing…" : "Confirm Swap"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
