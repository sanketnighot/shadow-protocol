import type { ChangeEvent } from "react";

import type {
  AlertOnlyAction,
  DcaBuyAction,
  DriftTrigger,
  RebalanceToTargetAction,
  StrategyCondition,
  StrategyDraftNode,
  ThresholdTrigger,
  TimeTrigger,
} from "@/types/strategy";

type StrategyInspectorProps = {
  node: StrategyDraftNode | null;
  onUpdate: (data: StrategyDraftNode["data"]) => void;
};

function updateTargetAllocations(
  value: string,
): Array<{ symbol: string; percentage: number }> {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [symbol, percentage] = entry.split(":");
      return {
        symbol: (symbol ?? "").trim().toUpperCase(),
        percentage: Number((percentage ?? "0").trim()),
      };
    })
    .filter((item) => item.symbol.length > 0 && Number.isFinite(item.percentage));
}

function renderField(
  label: string,
  input: React.ReactNode,
) {
  return (
    <label className="grid gap-2 text-sm text-muted">
      <span>{label}</span>
      {input}
    </label>
  );
}

export function StrategyInspector({ node, onUpdate }: StrategyInspectorProps) {
  if (!node) {
    return (
      <section className="glass-panel rounded-sm p-5">
        <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
          Inspector
        </p>
        <p className="mt-4 text-sm text-muted">
          Select a node in the canvas to edit its executable configuration.
        </p>
      </section>
    );
  }

  const data = node.data;

  const inputClassName =
    "rounded-sm border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none";

  const handleTextInput =
    <T extends StrategyDraftNode["data"]>(current: T, field: keyof T) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const raw = event.currentTarget.value;
      const nextValue =
        field.toString().toLowerCase().includes("usd") ||
        field.toString().toLowerCase().includes("pct") ||
        field.toString().toLowerCase().includes("seconds") ||
        field === "value" ||
        field === "amountToken"
          ? Number(raw)
          : raw;
      onUpdate({ ...current, [field]: nextValue } as StrategyDraftNode["data"]);
    };

  return (
    <section className="glass-panel rounded-sm p-5">
      <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
        Inspector
      </p>
      <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-foreground">
        {node.type === "trigger"
          ? "Trigger Step"
          : node.type === "condition"
            ? "Condition Step"
            : "Action Step"}
      </h2>

      <div className="mt-5 grid gap-4">
        {node.type === "trigger" && data.type === "time_interval" && (() => {
          const trigger = data as TimeTrigger;
          return (
            <>
              {renderField(
                "Interval",
                <select
                  value={trigger.interval}
                  onChange={handleTextInput(trigger, "interval")}
                  className={inputClassName}
                >
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>,
              )}
              {renderField(
                "Timezone",
                <input
                  value={trigger.timezone ?? "UTC"}
                  onChange={handleTextInput(trigger, "timezone")}
                  className={inputClassName}
                />,
              )}
            </>
          );
        })()}

        {node.type === "trigger" && data.type === "drift_threshold" && (() => {
          const trigger = data as DriftTrigger;
          return (
            <>
              {renderField(
                "Drift Threshold %",
                <input
                  type="number"
                  value={trigger.driftPct}
                  onChange={handleTextInput(trigger, "driftPct")}
                  className={inputClassName}
                />,
              )}
              {renderField(
                "Evaluation Interval Seconds",
                <input
                  type="number"
                  value={trigger.evaluationIntervalSeconds ?? 300}
                  onChange={handleTextInput(trigger, "evaluationIntervalSeconds")}
                  className={inputClassName}
                />,
              )}
              {renderField(
                "Target Allocations",
                <input
                  value={trigger.targetAllocations.map((item) => `${item.symbol}:${item.percentage}`).join(", ")}
                  onChange={(event) =>
                    onUpdate({
                      ...trigger,
                      targetAllocations: updateTargetAllocations(event.currentTarget.value),
                    })
                  }
                  className={inputClassName}
                />,
              )}
            </>
          );
        })()}

        {node.type === "trigger" && data.type === "threshold" && (() => {
          const trigger = data as ThresholdTrigger;
          return (
            <>
              {renderField(
                "Operator",
                <select
                  value={trigger.operator}
                  onChange={handleTextInput(trigger, "operator")}
                  className={inputClassName}
                >
                  <option value="lte">LTE</option>
                  <option value="gte">GTE</option>
                </select>,
              )}
              {renderField(
                "Portfolio Value Threshold",
                <input
                  type="number"
                  value={trigger.value}
                  onChange={handleTextInput(trigger, "value")}
                  className={inputClassName}
                />,
              )}
            </>
          );
        })()}

        {node.type === "condition" && (() => {
          const condition = data as StrategyCondition;
          return (
            <>
              {renderField(
                "Condition Type",
                <select
                  value={condition.type}
                  onChange={(event) => {
                    const nextType = event.currentTarget.value as StrategyCondition["type"];
                    if (nextType === "portfolio_floor") {
                      onUpdate({ type: "portfolio_floor", minPortfolioUsd: 5_000 });
                    } else if (nextType === "max_gas") {
                      onUpdate({ type: "max_gas", maxGasUsd: 25 });
                    } else if (nextType === "max_slippage") {
                      onUpdate({ type: "max_slippage", maxSlippageBps: 50 });
                    } else if (nextType === "wallet_asset_available") {
                      onUpdate({ type: "wallet_asset_available", symbol: "USDC", minAmount: 100 });
                    } else if (nextType === "drift_minimum") {
                      onUpdate({ type: "drift_minimum", minDriftPct: 5 });
                    } else {
                      onUpdate({ type: "cooldown", cooldownSeconds: 300 });
                    }
                  }}
                  className={inputClassName}
                >
                  <option value="cooldown">Cooldown</option>
                  <option value="portfolio_floor">Portfolio Floor</option>
                  <option value="max_gas">Max Gas</option>
                  <option value="max_slippage">Max Slippage</option>
                  <option value="wallet_asset_available">Wallet Asset Available</option>
                  <option value="drift_minimum">Drift Minimum</option>
                </select>,
              )}

              {condition.type === "cooldown" &&
                renderField(
                  "Cooldown Seconds",
                  <input
                    type="number"
                    value={condition.cooldownSeconds}
                    onChange={handleTextInput(condition, "cooldownSeconds")}
                    className={inputClassName}
                  />,
                )}
              {condition.type === "portfolio_floor" &&
                renderField(
                  "Min Portfolio USD",
                  <input
                    type="number"
                    value={condition.minPortfolioUsd}
                    onChange={handleTextInput(condition, "minPortfolioUsd")}
                    className={inputClassName}
                  />,
                )}
              {condition.type === "max_gas" &&
                renderField(
                  "Max Gas USD",
                  <input
                    type="number"
                    value={condition.maxGasUsd}
                    onChange={handleTextInput(condition, "maxGasUsd")}
                    className={inputClassName}
                  />,
                )}
              {condition.type === "max_slippage" &&
                renderField(
                  "Max Slippage BPS",
                  <input
                    type="number"
                    value={condition.maxSlippageBps}
                    onChange={handleTextInput(condition, "maxSlippageBps")}
                    className={inputClassName}
                  />,
                )}
              {condition.type === "wallet_asset_available" && (
                <>
                  {renderField(
                    "Asset Symbol",
                    <input
                      value={condition.symbol}
                      onChange={handleTextInput(condition, "symbol")}
                      className={inputClassName}
                    />,
                  )}
                  {renderField(
                    "Minimum Amount",
                    <input
                      type="number"
                      value={condition.minAmount}
                      onChange={handleTextInput(condition, "minAmount")}
                      className={inputClassName}
                    />,
                  )}
                </>
              )}
              {condition.type === "drift_minimum" &&
                renderField(
                  "Minimum Drift %",
                  <input
                    type="number"
                    value={condition.minDriftPct}
                    onChange={handleTextInput(condition, "minDriftPct")}
                    className={inputClassName}
                  />,
                )}
            </>
          );
        })()}

        {node.type === "action" && data.type === "dca_buy" && (() => {
          const action = data as DcaBuyAction;
          return (
            <>
              {renderField(
                "Chain",
                <select
                  value={action.chain}
                  onChange={handleTextInput(action, "chain")}
                  className={inputClassName}
                >
                  <option value="ethereum">Ethereum</option>
                  <option value="base">Base</option>
                  <option value="polygon">Polygon</option>
                </select>,
              )}
              {renderField(
                "Source Asset",
                <input
                  value={action.fromSymbol}
                  onChange={handleTextInput(action, "fromSymbol")}
                  className={inputClassName}
                />,
              )}
              {renderField(
                "Destination Asset",
                <input
                  value={action.toSymbol}
                  onChange={handleTextInput(action, "toSymbol")}
                  className={inputClassName}
                />,
              )}
              {renderField(
                "Amount USD",
                <input
                  type="number"
                  value={action.amountUsd ?? 0}
                  onChange={handleTextInput(action, "amountUsd")}
                  className={inputClassName}
                />,
              )}
            </>
          );
        })()}

        {node.type === "action" && data.type === "rebalance_to_target" && (() => {
          const action = data as RebalanceToTargetAction;
          return (
            <>
              {renderField(
                "Chain Scope",
                <select
                  value={action.chain}
                  onChange={handleTextInput(action, "chain")}
                  className={inputClassName}
                >
                  <option value="multi_chain">Multi-chain</option>
                  <option value="ethereum">Ethereum</option>
                  <option value="base">Base</option>
                  <option value="polygon">Polygon</option>
                </select>,
              )}
              {renderField(
                "Rebalance Threshold %",
                <input
                  type="number"
                  value={action.thresholdPct}
                  onChange={handleTextInput(action, "thresholdPct")}
                  className={inputClassName}
                />,
              )}
              {renderField(
                "Max Execution USD",
                <input
                  type="number"
                  value={action.maxExecutionUsd ?? 0}
                  onChange={handleTextInput(action, "maxExecutionUsd")}
                  className={inputClassName}
                />,
              )}
              {renderField(
                "Target Allocations",
                <input
                  value={action.targetAllocations.map((item) => `${item.symbol}:${item.percentage}`).join(", ")}
                  onChange={(event) =>
                    onUpdate({
                      ...action,
                      targetAllocations: updateTargetAllocations(event.currentTarget.value),
                    })
                  }
                  className={inputClassName}
                />,
              )}
            </>
          );
        })()}

        {node.type === "action" && data.type === "alert_only" && (() => {
          const action = data as AlertOnlyAction;
          return (
            <>
              {renderField(
                "Alert Title",
                <input
                  value={action.title}
                  onChange={handleTextInput(action, "title")}
                  className={inputClassName}
                />,
              )}
              {renderField(
                "Severity",
                <select
                  value={action.severity}
                  onChange={handleTextInput(action, "severity")}
                  className={inputClassName}
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>,
              )}
              {renderField(
                "Message Template",
                <textarea
                  value={action.messageTemplate}
                  onChange={handleTextInput(action, "messageTemplate")}
                  className={inputClassName}
                  rows={4}
                />,
              )}
            </>
          );
        })()}
      </div>
    </section>
  );
}
