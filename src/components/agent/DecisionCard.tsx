import { Target, Zap } from "lucide-react";

type DecisionCardProps = {
  insights: Record<string, unknown>;
  decision: Record<string, unknown>;
  simulated: boolean;
};

function safeStr(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return JSON.stringify(v);
}

export function DecisionCard({ insights, decision, simulated }: DecisionCardProps) {
  const totalValue = (insights.totalValue as number) ?? 0;
  const riskLevel = safeStr(insights.riskLevel).toLowerCase();
  const allocations = (insights.allocations as unknown) ?? [];
  const allocList = Array.isArray(allocations)
    ? (allocations as { token?: string; percentage?: number }[])
    : [];
  const dominantAsset = safeStr(insights.dominantAsset);
  const imbalance = safeStr(insights.imbalance);

  const action = safeStr(decision.action);
  const tokenFrom = safeStr(decision.tokenFrom);
  const tokenTo = safeStr(decision.tokenTo);
  const amountPct = (decision.amountPercentage as number) ?? 0;
  const reason = safeStr(decision.reason);
  const confidence = safeStr(decision.confidence).toLowerCase();

  return (
    <div className="rounded-sm border border-border bg-surface-elevated p-4 shadow-none border border-white/5">
      <div className="mb-2 flex items-center gap-2">
        <Target className="size-3.5 text-primary/80" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          Portfolio advice{simulated ? " (simulated)" : ""}
        </span>
      </div>

      <div className="mb-2 grid gap-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-muted">Total value</span>
          <span className="font-medium text-foreground/95">${totalValue.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Risk level</span>
          <span className="font-medium capitalize text-foreground/95">{riskLevel}</span>
        </div>
        {dominantAsset !== "—" && (
          <div className="flex justify-between">
            <span className="text-muted">Dominant asset</span>
            <span className="font-medium text-foreground/95">{dominantAsset}</span>
          </div>
        )}
        {imbalance !== "—" && imbalance !== "balanced" && (
          <div className="flex justify-between">
            <span className="text-muted">Imbalance</span>
            <span className="font-medium text-amber-400/90">{imbalance}</span>
          </div>
        )}
      </div>

      {allocList.length > 0 && (
        <div className="mb-2 border-t border-border pt-1.5">
          <p className="mb-1.5 text-[10px] text-muted">Allocations</p>
          <div className="flex flex-wrap gap-2">
            {allocList.map((a, i) => (
              <span
                key={i}
                className="rounded bg-secondary px-2 py-0.5 font-mono text-[10px] text-foreground/85"
              >
                {safeStr(a.token)} {typeof a.percentage === "number" ? `${a.percentage.toFixed(1)}%` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5">
        <Zap className="mt-0.5 size-3.5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-medium capitalize text-foreground/95">{action}</p>
          {amountPct > 0 && (tokenFrom || tokenTo) && (
            <p className="mt-0.5 text-[11px] text-muted">
              {amountPct}% {tokenFrom && `${tokenFrom} → `}{tokenTo}
            </p>
          )}
          <p className="mt-1 text-[11px] text-foreground/80">{reason}</p>
          <p className="mt-0.5 text-[10px] text-muted">Confidence: {confidence}</p>
        </div>
      </div>
    </div>
  );
}
