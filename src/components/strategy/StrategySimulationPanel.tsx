import type { StrategySimulationResult, StrategyValidationIssue } from "@/types/strategy";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StrategySimulationStripProps = {
  simulation: StrategySimulationResult | null;
  isCompiling: boolean;
  onOpenPreview: () => void;
};

/** Compact status row under the canvas toolbar. */
export function StrategySimulationStrip({
  simulation,
  isCompiling,
  onOpenPreview,
}: StrategySimulationStripProps) {
  const errCount = simulation?.plan?.validationErrors?.length ?? 0;
  const warnCount = simulation?.plan?.warnings?.length ?? 0;
  const valid = Boolean(simulation?.valid);
  const summary =
    errCount > 0
      ? simulation?.plan?.validationErrors?.[0]?.message ?? simulation?.message ?? "Fix validation errors to activate."
      : !valid && simulation?.message
        ? simulation.message
        : simulation?.message ?? "Edits compile automatically in the Preview tab.";

  return (
    <div className="flex flex-col gap-2 border-t border-border bg-black/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span
          className={cn(
            "shrink-0 rounded-sm border px-2 py-1 font-mono text-[10px] tracking-[0.14em] uppercase",
            isCompiling
              ? "border-white/15 bg-white/5 text-muted"
              : valid
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-amber-500/30 bg-amber-500/10 text-amber-100",
          )}
        >
          {isCompiling ? "Compiling" : valid ? "Valid" : errCount > 0 ? `${errCount} error${errCount === 1 ? "" : "s"}` : "Needs fixes"}
        </span>
        {warnCount > 0 && valid ? (
          <span className="text-[10px] text-amber-200/90">{warnCount} warning{warnCount === 1 ? "" : "s"}</span>
        ) : null}
        <p className="min-w-0 truncate text-xs text-muted">{summary}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 rounded-sm border-white/10 text-xs"
        onClick={onOpenPreview}
      >
        Full preview
      </Button>
    </div>
  );
}

type StrategySimulationDetailProps = {
  simulation: StrategySimulationResult | null;
  isCompiling: boolean;
  onSelectIssue?: (issue: StrategyValidationIssue) => void;
};

/** Full compile / simulation output for the Preview rail tab. */
export function StrategySimulationDetail({
  simulation,
  isCompiling,
  onSelectIssue,
}: StrategySimulationDetailProps) {
  return (
    <div className="space-y-4 text-sm">
      {isCompiling ? (
        <p className="text-muted">Recompiling draft…</p>
      ) : null}

      {simulation ? (
        <>
          <p className="text-muted">{simulation.message}</p>
          <div className="rounded-sm border border-border bg-secondary/40 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              Execution mode
            </p>
            <p className="mt-2 text-foreground">{simulation.evaluationPreview.executionMode}</p>
          </div>
          <div className="rounded-sm border border-border bg-secondary/40 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              Action summary
            </p>
            <p className="mt-2 text-foreground">{simulation.evaluationPreview.expectedActionSummary}</p>
          </div>
          {simulation.plan?.validationErrors?.length ? (
            <div className="rounded-sm border border-red-500/20 bg-red-500/10 p-3">
              <p className="font-semibold text-red-300">Validation errors</p>
              <ul className="mt-2 space-y-2 text-red-100/90">
                {simulation.plan.validationErrors.map((item) => (
                  <li key={`${item.code}-${item.message}`}>
                    {onSelectIssue ? (
                      <button
                        type="button"
                        className="w-full rounded-sm text-left text-sm underline decoration-red-300/50 underline-offset-2 hover:decoration-red-200"
                        onClick={() => onSelectIssue(item)}
                      >
                        {item.message}
                      </button>
                    ) : (
                      item.message
                    )}
                  </li>
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
        </>
      ) : (
        <p className="text-muted">
          The builder compiles and simulates automatically as you edit. Open this tab to review execution mode,
          warnings, and condition previews.
        </p>
      )}
    </div>
  );
}
