import { useState } from "react";

import { GUARDRAIL_DEFAULTS } from "@/data/mock";
import { Button } from "@/components/ui/button";

export function GuardrailsForm() {
  const [guardrails, setGuardrails] = useState(GUARDRAIL_DEFAULTS);

  return (
    <section className="glass-panel rounded-[24px] border border-white/10 p-5">
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
            value={guardrails.maxTradeUsd}
            onChange={(event) =>
              setGuardrails((current) => ({
                ...current,
                maxTradeUsd: event.currentTarget.value,
              }))
            }
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-foreground outline-none"
          />
        </label>
        <label className="grid gap-2 text-sm text-muted">
          Stop if portfolio below (USD)
          <input
            value={guardrails.stopBelowPortfolioUsd}
            onChange={(event) =>
              setGuardrails((current) => ({
                ...current,
                stopBelowPortfolioUsd: event.currentTarget.value,
              }))
            }
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-foreground outline-none"
          />
        </label>
        <label className="grid gap-2 text-sm text-muted">
          Require approval above (USD)
          <input
            value={guardrails.requireApprovalAboveUsd}
            onChange={(event) =>
              setGuardrails((current) => ({
                ...current,
                requireApprovalAboveUsd: event.currentTarget.value,
              }))
            }
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-foreground outline-none"
          />
        </label>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button className="rounded-full px-5">Save Strategy</Button>
        <Button
          variant="outline"
          className="rounded-full border-white/10 bg-white/5 text-foreground hover:bg-white/10"
        >
          Test Simulation
        </Button>
      </div>
    </section>
  );
}
