import { Sparkles } from "lucide-react";

import { GuardrailsForm } from "@/components/strategy/GuardrailsForm";
import { StrategyCanvas } from "@/components/strategy/StrategyCanvas";

export function StrategyBuilder() {
  return (
    <div className="space-y-6">
      <section className="glass-panel rounded-[24px] border border-white/10 p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
              Strategy builder
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-foreground">
              Visual no-code orchestration for DeFi automation.
            </h1>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-4 py-2 text-sm text-primary">
            <Sparkles className="size-4" />
            Trigger → Condition → Action
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <StrategyCanvas />
        <GuardrailsForm />
      </div>
    </div>
  );
}
