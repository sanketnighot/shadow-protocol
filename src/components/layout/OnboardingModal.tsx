import { ShieldCheck, Sparkles, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type OnboardingModalProps = {
  open: boolean;
  onComplete: () => void;
};

export function OnboardingModal({ open, onComplete }: OnboardingModalProps) {
  return (
    <Dialog open={open}>
      <DialogContent
        className="glass-panel max-w-[calc(100%-1.5rem)] rounded-[28px] border-white/10 bg-background p-5 text-foreground sm:max-w-2xl sm:p-6"
        showCloseButton={false}
      >
        <DialogHeader className="text-left">
          <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
            Welcome
          </p>
          <DialogTitle className="mt-2 text-3xl font-bold tracking-[-0.04em]">
            SHADOW keeps strategy, context, and approvals on your machine.
          </DialogTitle>
          <DialogDescription className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            Start with the dashboard, review opportunities in Market, and open the command palette anytime with Cmd/Ctrl + K.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
            <ShieldCheck className="size-5 text-primary" />
            <p className="mt-4 font-semibold text-foreground">Privacy first</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Toggle private routing defaults without leaving the desktop app.
            </p>
          </div>
          <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
            <Sparkles className="size-5 text-primary" />
            <p className="mt-4 font-semibold text-foreground">Agent guidance</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Ask the local agent for yield, swaps, or strategy ideas with streaming replies.
            </p>
          </div>
          <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
            <Wallet className="size-5 text-primary" />
            <p className="mt-4 font-semibold text-foreground">Actionable flows</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Launch send, swap, or bridge previews directly from your portfolio view.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-3 sm:justify-between">
          <p className="text-sm text-muted">You can revisit these preferences later in Settings.</p>
          <Button type="button" className="rounded-full px-6" onClick={onComplete}>
            Enter workspace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
