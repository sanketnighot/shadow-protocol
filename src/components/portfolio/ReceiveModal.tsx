import { Copy, Check, Wallet } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWalletStore } from "@/store/useWalletStore";
import { useToast } from "@/hooks/useToast";

type ReceiveModalProps = {
  open: boolean;
  onClose: () => void;
};

export function ReceiveModal({ open, onClose }: ReceiveModalProps) {
  const { addresses, walletNames } = useWalletStore();
  const { success } = useToast();
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const handleCopy = (address: string) => {
    void navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    success("Address Copied", "Wallet address has been copied to your clipboard.");
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <DialogContent className="glass-panel max-w-[calc(100%-1.5rem)] rounded-sm bg-background p-0 text-foreground sm:max-w-lg overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-2xl font-bold tracking-tight uppercase">
            Receive Assets
          </DialogTitle>
          <DialogDescription className="text-sm text-muted">
            Select a wallet address to copy and receive funds.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-3">
          {addresses.length > 0 ? (
            addresses.map((address) => (
              <div 
                key={address}
                className="group flex flex-col gap-2 rounded-sm border border-white/5 bg-white/5 p-4 transition-colors hover:border-white/10"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wallet className="size-3.5 text-primary" />
                    <span className="text-[10px] font-mono font-bold tracking-widest text-primary uppercase">
                      {walletNames[address] || "Unnamed Wallet"}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-8 rounded-sm text-muted hover:text-foreground hover:bg-white/10"
                    onClick={() => handleCopy(address)}
                  >
                    {copiedAddress === address ? (
                      <Check className="size-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </Button>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-sm break-all text-foreground/90">
                    {address}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-muted">No wallets found.</p>
            </div>
          )}
        </div>

        <div className="bg-white/5 p-4 flex justify-center border-t border-white/5">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted hover:text-foreground"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
