import { useEffect, useState } from "react";

import type { ActiveStrategy } from "@/data/mock";
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

type StrategyEditorModalProps = {
  open: boolean;
  strategy: ActiveStrategy | null;
  onClose: () => void;
  onSave: (strategyId: string, updates: Pick<ActiveStrategy, "name" | "summary" | "nextRun">) => void;
};

export function StrategyEditorModal({
  open,
  strategy,
  onClose,
  onSave,
}: StrategyEditorModalProps) {
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [nextRun, setNextRun] = useState("");

  useEffect(() => {
    setName(strategy?.name ?? "");
    setSummary(strategy?.summary ?? "");
    setNextRun(strategy?.nextRun ?? "");
  }, [strategy]);

  const isDisabled =
    !strategy ||
    name.trim().length < 3 ||
    summary.trim().length < 12 ||
    nextRun.trim().length < 3;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <DialogContent className="glass-panel max-w-[calc(100%-1.5rem)] rounded-[28px] bg-background p-5 text-foreground sm:max-w-xl sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold tracking-[-0.03em]">
            Edit strategy
          </DialogTitle>
          <DialogDescription className="text-sm text-muted">
            Update the label, summary, and next run window for this automation.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <label className="grid gap-2 text-sm text-muted">
            Name
            <Input
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              className="h-11 rounded-2xl border-border bg-secondary"
            />
          </label>
          <label className="grid gap-2 text-sm text-muted">
            Summary
            <textarea
              value={summary}
              onChange={(event) => setSummary(event.currentTarget.value)}
              rows={4}
              className="rounded-2xl border border-border bg-secondary px-3 py-2 text-foreground outline-none"
            />
          </label>
          <label className="grid gap-2 text-sm text-muted">
            Next run
            <Input
              value={nextRun}
              onChange={(event) => setNextRun(event.currentTarget.value)}
              className="h-11 rounded-2xl border-border bg-secondary"
            />
          </label>
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
            disabled={isDisabled}
            onClick={() => {
              if (!strategy || isDisabled) {
                return;
              }

              onSave(strategy.id, {
                name: name.trim(),
                summary: summary.trim(),
                nextRun: nextRun.trim(),
              });
            }}
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
