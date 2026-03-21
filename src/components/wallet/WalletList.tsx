import { Copy, Trash2 } from "lucide-react";
import { getAddress } from "viem";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { useWalletStore } from "@/store/useWalletStore";
import { invoke } from "@tauri-apps/api/core";

function truncateAddress(addr: string): string {
  try {
    const checksummed = getAddress(addr);
    return `${checksummed.slice(0, 6)}…${checksummed.slice(-4)}`;
  } catch {
    return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
  }
}

export function WalletList() {
  const { addresses, refreshWallets } = useWalletStore();
  const { success } = useToast();

  const handleCopy = (addr: string) => {
    void navigator.clipboard.writeText(addr);
    success("Copied", "Address copied to clipboard");
  };

  const handleRemove = async (addr: string) => {
    try {
      await invoke("wallet_remove", { input: { address: addr } });
      void refreshWallets();
      success("Removed", "Wallet removed from device");
    } catch {
      // ignore
    }
  };

  if (addresses.length === 0) return null;

  return (
    <ul className="space-y-2">
      {addresses.map((addr) => (
        <li
          key={addr}
          className="flex items-center justify-between gap-3 rounded-sm border border-white/10 bg-white/5 px-4 py-3"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="font-mono text-sm text-foreground">
              {truncateAddress(addr)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 rounded-sm"
              onClick={() => handleCopy(addr)}
              title="Copy address"
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 rounded-sm text-muted hover:text-destructive"
            onClick={() => void handleRemove(addr)}
            title="Remove wallet"
          >
            <Trash2 className="size-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
