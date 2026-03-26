import type { StrategySimulationResult } from "@/types/strategy";

type StrategySimulationPanelProps = {
  simulation: StrategySimulationResult | null;
  isCompiling: boolean;
};

export function StrategySimulationPanel({
  simulation,
  isCompiling,
}: StrategySimulationPanelProps) {
  return (
    <section className="glass-panel rounded-sm p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
            Simulation
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-foreground">
            Compile and execution preview
          </h2>
        </div>
        <span className="rounded-sm border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-muted">
          {isCompiling ? "Compiling…" : simulation?.valid ? "Valid" : "Needs fixes"}
        </span>
      </div>

      {simulation ? (
        <div className="mt-5 space-y-4 text-sm">
          <p className="text-muted">{simulation.message}</p>
          <div className="rounded-sm border border-border bg-secondary/40 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              Execution Mode
            </p>
            <p className="mt-2 text-foreground">{simulation.evaluationPreview.executionMode}</p>
          </div>
          <div className="rounded-sm border border-border bg-secondary/40 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              Action Summary
            </p>
            <p className="mt-2 text-foreground">{simulation.evaluationPreview.expectedActionSummary}</p>
          </div>
          {simulation.plan?.validationErrors?.length ? (
            <div className="rounded-sm border border-red-500/20 bg-red-500/10 p-3">
              <p className="font-semibold text-red-300">Validation errors</p>
              <ul className="mt-2 space-y-1 text-red-100/90">
                {simulation.plan.validationErrors.map((item) => (
                  <li key={`${item.code}-${item.message}`}>{item.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {simulation.plan?.warnings?.length ? (
            <div className="rounded-sm border border-amber-500/20 bg-amber-500/10 p-3">
              <p className="font-semibold text-amber-200">Warnings</p>
              <ul className="mt-2 space-y-1 text-amber-50/90">
                {simulation.plan.warnings.map((item) => (
                  <li key={`${item.code}-${item.message}`}>{item.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {simulation.evaluationPreview.conditionResults.length > 0 ? (
            <div className="rounded-sm border border-border bg-secondary/40 p-3">
              <p className="font-semibold text-foreground">Condition preview</p>
              <div className="mt-2 space-y-2">
                {simulation.evaluationPreview.conditionResults.map((result) => (
                  <div
                    key={`${result.code}-${result.message}`}
                    className="flex items-start justify-between gap-3 rounded-sm bg-black/10 px-3 py-2"
                  >
                    <span className="text-foreground/90">{result.message}</span>
                    <span
                      className={`shrink-0 rounded-sm px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${
                        result.passed
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-red-500/15 text-red-300"
                      }`}
                    >
                      {result.passed ? "Pass" : "Block"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-5 text-sm text-muted">
          The builder will compile and simulate automatically as you edit the strategy.
        </p>
      )}
    </section>
  );
}
