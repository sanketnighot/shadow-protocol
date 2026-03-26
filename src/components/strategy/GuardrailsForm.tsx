import type { StrategyGuardrails } from "@/types/strategy";

import { cn } from "@/lib/utils";

const CHAIN_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "ethereum", label: "Ethereum" },
  { id: "base", label: "Base" },
  { id: "polygon", label: "Polygon" },
  { id: "eth-sepolia", label: "Sepolia" },
  { id: "base-sepolia", label: "Base Sepolia" },
  { id: "polygon-amoy", label: "Amoy" },
];

type GuardrailsFormProps = {
  guardrails: StrategyGuardrails;
  onChange: (patch: Partial<StrategyGuardrails>) => void;
  /** Inline validation messages for guardrail fields (e.g. from compile). */
  safetyIssues?: string[];
};

export function GuardrailsForm({ guardrails, onChange, safetyIssues }: GuardrailsFormProps) {
  const allowed = new Set(guardrails.allowedChains ?? []);

  const toggleChain = (chainId: string) => {
    const next = new Set(allowed);
    if (next.has(chainId)) {
      next.delete(chainId);
    } else {
      next.add(chainId);
    }
    onChange({ allowedChains: [...next].sort() });
  };

  const inputClassName =
    "rounded-sm border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none";

  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
          Guardrails
        </p>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
          Safety before automation
        </h2>
        <p className="mt-1 text-xs text-muted">
          Applied at execution time in Rust. Save the draft from the header when ready.
        </p>
      </div>

      {safetyIssues && safetyIssues.length > 0 ? (
        <div className="rounded-sm border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          <p className="font-medium text-amber-200">Guardrail checks</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {safetyIssues.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs text-muted">
          <span title="Maximum notional for a single automated trade.">Max per trade (USD)</span>
          <input
            type="number"
            value={guardrails.maxPerTradeUsd ?? ""}
            onChange={(event) =>
              onChange({
                maxPerTradeUsd: Number(event.currentTarget.value),
              })
            }
            className={inputClassName}
          />
        </label>
        <label className="grid gap-1.5 text-xs text-muted">
          <span title="Cap on total notional per rolling day.">Max daily notional (USD)</span>
          <input
            type="number"
            value={guardrails.maxDailyNotionalUsd ?? ""}
            onChange={(event) =>
              onChange({
                maxDailyNotionalUsd: Number(event.currentTarget.value),
              })
            }
            className={inputClassName}
          />
        </label>
        <label className="grid gap-1.5 text-xs text-muted">
          <span title="Trades above this amount require explicit approval when in approval mode.">
            Require approval above (USD)
          </span>
          <input
            type="number"
            value={guardrails.requireApprovalAboveUsd ?? ""}
            onChange={(event) =>
              onChange({
                requireApprovalAboveUsd: Number(event.currentTarget.value),
              })
            }
            className={inputClassName}
          />
        </label>
        <label className="grid gap-1.5 text-xs text-muted">
          <span title="Skip execution if total portfolio value falls below this.">
            Stop if portfolio below (USD)
          </span>
          <input
            type="number"
            value={guardrails.minPortfolioUsd ?? ""}
            onChange={(event) =>
              onChange({
                minPortfolioUsd: Number(event.currentTarget.value),
              })
            }
            className={inputClassName}
          />
        </label>
        <label className="grid gap-1.5 text-xs text-muted">
          <span title="Minimum time between two runs for this strategy.">Cooldown (seconds)</span>
          <input
            type="number"
            value={guardrails.cooldownSeconds ?? ""}
            onChange={(event) =>
              onChange({
                cooldownSeconds: Number(event.currentTarget.value),
              })
            }
            className={inputClassName}
          />
        </label>
        <label className="grid gap-1.5 text-xs text-muted">
          <span title="Maximum route slippage in basis points.">Max slippage (bps)</span>
          <input
            type="number"
            value={guardrails.maxSlippageBps ?? ""}
            onChange={(event) =>
              onChange({
                maxSlippageBps: Number(event.currentTarget.value),
              })
            }
            className={inputClassName}
          />
        </label>
        <label className="grid gap-1.5 text-xs text-muted">
          <span title="Upper bound on gas spend per execution in USD.">Max gas (USD)</span>
          <input
            type="number"
            value={guardrails.maxGasUsd ?? ""}
            onChange={(event) =>
              onChange({
                maxGasUsd: Number(event.currentTarget.value),
              })
            }
            className={inputClassName}
          />
        </label>
      </div>

      <div className="grid gap-2">
        <span className="text-xs text-muted" title="Chains where this strategy may execute.">
          Allowed chains
        </span>
        <div className="flex flex-wrap gap-2">
          {CHAIN_OPTIONS.map((chain) => {
            const active = allowed.has(chain.id);
            return (
              <button
                key={chain.id}
                type="button"
                onClick={() => toggleChain(chain.id)}
                className={cn(
                  "rounded-sm border px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-primary/40 bg-primary/15 text-foreground"
                    : "border-border bg-secondary text-muted hover:text-foreground",
                )}
              >
                {chain.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
