import { useState } from "react";
import { Check, ChevronDown, Copy, Layers, Pencil, Trash2, Wallet } from "lucide-react";
import { getAddress } from "viem";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export function WalletSelectorDropdown() {
  const { addresses, activeAddress, walletNames, setActiveAddress, setWalletName, refreshWallets } =
    useWalletStore();
  const { success } = useToast();
  const [renameAddr, setRenameAddr] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleCopy = (addr: string, e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(addr);
    success("Copied", "Address copied to clipboard");
  };

  const handleRemove = async (addr: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await invoke("wallet_remove", { input: { address: addr } });
      void refreshWallets();
      success("Removed", "Wallet removed from device");
    } catch {
      // ignore
    }
  };

  const openRename = (addr: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameAddr(addr);
    setRenameValue(walletNames[addr] ?? "");
  };

  const submitRename = () => {
    if (renameAddr) {
      setWalletName(renameAddr, renameValue);
      setRenameAddr(null);
      setRenameValue("");
    }
  };

  if (addresses.length === 0) return null;

  const activeLabel =
    activeAddress === null
      ? "All Wallets"
      : walletNames[activeAddress]?.trim() || truncateAddress(activeAddress);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="flex h-10 w-auto items-center justify-between gap-3 rounded-sm border-border bg-secondary px-4 py-2 hover:bg-surface-elevated hover:text-foreground"
          >
            <div className="flex items-center gap-2">
              {activeAddress === null ? (
                <Layers className="size-4 text-primary" />
              ) : (
                <Wallet className="size-4 text-primary" />
              )}
              <span className="font-medium">{activeLabel}</span>
            </div>
            <ChevronDown className="size-4 text-muted" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          className="w-[280px] rounded-sm border-border bg-surface-elevated p-2 shadow-none border border-white/5"
        >
          <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-muted uppercase">
            Aggregated View
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => setActiveAddress(null)}
            className={`cursor-pointer rounded-sm px-3 py-2.5 ${
              activeAddress === null ? "bg-primary/10" : "hover:bg-secondary"
            }`}
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-sm bg-primary/20 text-primary">
                  <Layers className="size-4" />
                </div>
                <span className="font-medium text-foreground">All Wallets</span>
              </div>
              {activeAddress === null && <Check className="size-4 text-primary" />}
            </div>
          </DropdownMenuItem>

          <DropdownMenuSeparator className="my-2 bg-white/10" />

          <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-muted uppercase">
            Individual Wallets
          </DropdownMenuLabel>
          <div className="flex max-h-[300px] flex-col gap-1 overflow-y-auto pr-1">
            {addresses.map((addr) => {
              const label = walletNames[addr]?.trim() || truncateAddress(addr);
              const isActive = activeAddress === addr;

              return (
                <div
                  key={addr}
                  className={`group relative flex items-center justify-between rounded-sm px-2 py-2 transition-colors ${
                    isActive ? "bg-primary/10" : "hover:bg-secondary"
                  }`}
                >
                  <button
                    className="flex flex-1 items-center gap-2.5 text-left"
                    onClick={() => setActiveAddress(addr)}
                  >
                    <div
                      className={`flex size-8 items-center justify-center rounded-sm ${
                        isActive
                          ? "bg-primary/20 text-primary"
                          : "bg-white/10 text-muted group-hover:text-foreground"
                      }`}
                    >
                      <Wallet className="size-4" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">{label}</span>
                      <span className="font-mono text-[10px] text-muted">{truncateAddress(addr)}</span>
                    </div>
                  </button>

                  {/* Actions Dropdown for specific wallet */}
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={(e) => handleCopy(addr, e)}
                      className="rounded p-1.5 text-muted hover:bg-white/10 hover:text-foreground"
                      title="Copy Address"
                    >
                      <Copy className="size-3.5" />
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="rounded p-1.5 text-muted hover:bg-white/10 hover:text-foreground">
                          <Pencil className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40 rounded-sm">
                        <DropdownMenuItem onClick={(e) => openRename(addr, e as any)}>
                          <Pencil className="mr-2 size-4" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(e) => void handleRemove(addr, e as any)}
                        >
                          <Trash2 className="mr-2 size-4" /> Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {isActive && <Check className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-primary group-hover:opacity-0" />}
                </div>
              );
            })}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={!!renameAddr} onOpenChange={(open) => !open && setRenameAddr(null)}>
        <DialogContent className="rounded-sm border-border bg-surface">
          <DialogHeader>
            <DialogTitle>Rename wallet</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Wallet name"
            onKeyDown={(e) => e.key === "Enter" && submitRename()}
            maxLength={32}
            className="rounded-sm border-border bg-secondary"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameAddr(null)} className="rounded-sm">
              Cancel
            </Button>
            <Button onClick={submitRename} className="rounded-sm">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
