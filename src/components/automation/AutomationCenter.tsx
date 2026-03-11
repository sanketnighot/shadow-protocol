import { ACTIVE_STRATEGIES } from "@/data/mock";
import { CreateStrategyButton } from "@/components/automation/CreateStrategyButton";
import { StrategyCard } from "@/components/automation/StrategyCard";

export function AutomationCenter() {
  return (
    <div className="space-y-6">
      <section className="glass-panel rounded-[24px] border border-white/10 p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
              Active strategies
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-foreground">
              Autonomous systems with human guardrails.
            </h1>
          </div>
          <CreateStrategyButton />
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {ACTIVE_STRATEGIES.map((strategy) => (
          <StrategyCard key={strategy.id} strategy={strategy} />
        ))}
      </div>
    </div>
  );
}
