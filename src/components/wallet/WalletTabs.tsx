import { useState } from "react";
import { Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { getAddress } from "viem";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export function WalletTabs() {
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

  return (
    <>
      <Tabs
        value={activeAddress ?? addresses[0]}
        onValueChange={(v) => setActiveAddress(v)}
      >
        <TabsList
          variant="line"
          className="h-auto w-full flex-wrap justify-start gap-1 rounded-none border-0 bg-transparent p-0"
        >
          {addresses.map((addr) => {
            const label = walletNames[addr]?.trim() || truncateAddress(addr);
            return (
              <TabsTrigger
                key={addr}
                value={addr}
                className="group flex shrink-0 items-center gap-2 rounded-sm border border-white/10 bg-white/5 px-4 py-2.5 data-[state=active]:border-white/20 data-[state=active]:bg-white/10"
              >
                <span className="font-mono text-sm">{label}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 rounded-sm opacity-60 hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="size-4" />
                      <span className="sr-only">Wallet menu</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => handleCopy(addr, e)}>
                      <Copy className="mr-2 size-4" />
                      Copy address
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => openRename(addr, e)}>
                      <Pencil className="mr-2 size-4" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={(e) => void handleRemove(addr, e)}
                    >
                      <Trash2 className="mr-2 size-4" />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <Dialog open={!!renameAddr} onOpenChange={(open) => !open && setRenameAddr(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename wallet</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Wallet name"
            onKeyDown={(e) => e.key === "Enter" && submitRename()}
            maxLength={32}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameAddr(null)}>
              Cancel
            </Button>
            <Button onClick={submitRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
