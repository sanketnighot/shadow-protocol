import type { StrategyGuardrails } from "@/types/strategy";
import { Button } from "@/components/ui/button";

type GuardrailsFormProps = {
  guardrails: StrategyGuardrails;
  onChange: (patch: Partial<StrategyGuardrails>) => void;
  onSave: () => void;
  onTestSimulation: () => void;
  isSaving?: boolean;
};

export function GuardrailsForm({
  guardrails,
  onChange,
  onSave,
  onTestSimulation,
  isSaving = false,
}: GuardrailsFormProps) {
  return (
    <section className="glass-panel rounded-sm p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
            Guardrails
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-foreground">
            Safety before automation
          </h2>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        <label className="grid gap-2 text-sm text-muted">
          Max per trade (USD)
          <input
            value={guardrails.maxPerTradeUsd}
            onChange={(event) =>
              onChange({
                maxPerTradeUsd: Number(event.currentTarget.value),
              })
            }
            className="rounded-sm border border-border bg-secondary px-4 py-3 text-foreground outline-none"
          />
        </label>
        <label className="grid gap-2 text-sm text-muted">
          Max daily notional (USD)
          <input
            value={guardrails.maxDailyNotionalUsd}
            onChange={(event) =>
              onChange({
                maxDailyNotionalUsd: Number(event.currentTarget.value),
              })
            }
            className="rounded-sm border border-border bg-secondary px-4 py-3 text-foreground outline-none"
          />
        </label>
        <label className="grid gap-2 text-sm text-muted">
          Require approval above (USD)
          <input
            value={guardrails.requireApprovalAboveUsd}
            onChange={(event) =>
              onChange({
                requireApprovalAboveUsd: Number(event.currentTarget.value),
              })
            }
            className="rounded-sm border border-border bg-secondary px-4 py-3 text-foreground outline-none"
          />
        </label>
        <label className="grid gap-2 text-sm text-muted">
          Stop if portfolio below (USD)
          <input
            value={guardrails.minPortfolioUsd}
            onChange={(event) =>
              onChange({
                minPortfolioUsd: Number(event.currentTarget.value),
              })
            }
            className="rounded-sm border border-border bg-secondary px-4 py-3 text-foreground outline-none"
          />
        </label>
        <label className="grid gap-2 text-sm text-muted">
          Cooldown (seconds)
          <input
            value={guardrails.cooldownSeconds}
            onChange={(event) =>
              onChange({
                cooldownSeconds: Number(event.currentTarget.value),
              })
            }
            className="rounded-sm border border-border bg-secondary px-4 py-3 text-foreground outline-none"
          />
        </label>
        <label className="grid gap-2 text-sm text-muted">
          Allowed chains
          <input
            value={guardrails.allowedChains.join(", ")}
            onChange={(event) =>
              onChange({
                allowedChains: event.currentTarget.value
                  .split(",")
                  .map((item) => item.trim().toLowerCase())
                  .filter(Boolean),
              })
            }
            className="rounded-sm border border-border bg-secondary px-4 py-3 text-foreground outline-none"
          />
        </label>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button
          className="rounded-sm px-5 active:scale-95"
          onClick={onSave}
          disabled={isSaving}
        >
          {isSaving ? "Saving…" : "Save Draft"}
        </Button>
        <Button
          variant="outline"
          className="rounded-sm border-border bg-secondary text-foreground hover:bg-surface-elevated active:scale-95"
          onClick={onTestSimulation}
        >
          Validate
        </Button>
      </div>
    </section>
  );
}
