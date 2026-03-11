import { ShieldAlert, TriangleAlert } from "lucide-react";

import type { ApprovalTransaction } from "@/data/mock";
import { PrivacyToggle } from "@/components/shared/PrivacyToggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ApprovalModalProps = {
  open: boolean;
  transaction: ApprovalTransaction;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
};

export function ApprovalModal({
  open,
  transaction,
  onApprove,
  onReject,
  onClose,
}: ApprovalModalProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <DialogContent className="glass-panel max-w-[calc(100%-1.5rem)] rounded-[28px] border-white/10 bg-background p-5 text-foreground sm:max-w-2xl sm:p-6">
        <DialogHeader className="space-y-3 text-left">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-primary/20 bg-primary/10 p-2.5 text-primary">
              <ShieldAlert className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold tracking-[-0.03em]">
                Approve transaction
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-muted">
                Human-in-the-loop confirmation before SHADOW executes this action.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
            <p className="text-xs tracking-[0.18em] text-muted uppercase">Action</p>
            <p className="mt-2 text-base font-semibold">{transaction.action}</p>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
            <p className="text-xs tracking-[0.18em] text-muted uppercase">Amount</p>
            <p className="mt-2 text-base font-semibold">{transaction.amount}</p>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
            <p className="text-xs tracking-[0.18em] text-muted uppercase">Chain</p>
            <p className="mt-2 text-base font-semibold">{transaction.chain}</p>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
            <p className="text-xs tracking-[0.18em] text-muted uppercase">Slippage / Gas</p>
            <p className="mt-2 text-base font-semibold">
              {transaction.slippage} / {transaction.gas}
            </p>
          </div>
        </div>

        <div className="rounded-[24px] border border-primary/15 bg-primary/8 p-4">
          <p className="text-xs tracking-[0.18em] text-muted uppercase">Reason</p>
          <p className="mt-2 text-sm leading-6 text-foreground/90">{transaction.reason}</p>
        </div>

        <div className="flex flex-col gap-4 rounded-[24px] border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <PrivacyToggle />
          <div className="inline-flex items-center gap-2 text-sm text-amber-200">
            <TriangleAlert className="size-4" />
            This executes within {transaction.executionWindow}.
          </div>
        </div>

        <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-muted">
          <input type="checkbox" className="size-4 accent-primary" />
          Don't ask again for this strategy
        </label>

        <DialogFooter className="gap-3 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-white/10 bg-white/5 text-foreground hover:bg-white/10"
            onClick={onReject}
          >
            Reject
          </Button>
          <Button type="button" className="rounded-full px-6" onClick={onApprove}>
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
