import type {
  DraftNodeData,
  StrategyDraft,
  StrategyDraftEdge,
  StrategyDraftNode,
} from "@/types/strategy";

export function getOrderedPipelineNodes(draft: StrategyDraft): StrategyDraftNode[] {
  const byId = new Map(draft.nodes.map((n) => [n.id, n]));
  const trigger = draft.nodes.find((n) => n.type === "trigger");
  if (!trigger) {
    return [...draft.nodes];
  }

  const ordered: StrategyDraftNode[] = [];
  const visited = new Set<string>();
  let current: StrategyDraftNode | undefined = trigger;

  while (current) {
    if (visited.has(current.id)) {
      break;
    }
    visited.add(current.id);
    ordered.push(current);
    const sourceId: string = current.id;
    const outEdge: StrategyDraftEdge | undefined = draft.edges.find(
      (e) => e.source === sourceId,
    );
    current = outEdge ? byId.get(outEdge.target) : undefined;
  }

  for (const n of draft.nodes) {
    if (!visited.has(n.id)) {
      ordered.push(n);
    }
  }

  return ordered;
}

export function getDraftNodeDisplayLabels(data: DraftNodeData): { title: string; subtitle: string } {
  switch (data.type) {
    case "time_interval":
      return {
        title: data.interval
          ? data.interval.charAt(0).toUpperCase() + data.interval.slice(1)
          : "Schedule",
        subtitle: data.timezone ?? "UTC",
      };
    case "drift_threshold":
      return {
        title: `Drift >= ${data.driftPct}%`,
        subtitle: `${data.targetAllocations.length} target allocations`,
      };
    case "threshold":
      return {
        title: `Portfolio ${data.operator.toUpperCase()} ${data.value}`,
        subtitle: data.metric,
      };
    case "portfolio_floor":
      return {
        title: `Portfolio >= $${data.minPortfolioUsd}`,
        subtitle: "Portfolio floor guard",
      };
    case "max_gas":
      return {
        title: `Gas <= $${data.maxGasUsd}`,
        subtitle: "Max gas threshold",
      };
    case "max_slippage":
      return {
        title: `Slippage <= ${data.maxSlippageBps} bps`,
        subtitle: "Route slippage guard",
      };
    case "wallet_asset_available":
      return {
        title: `${data.symbol} >= ${data.minAmount}`,
        subtitle: "Wallet balance check",
      };
    case "cooldown":
      return {
        title: `Cooldown ${data.cooldownSeconds}s`,
        subtitle: "Prevent repeat execution",
      };
    case "drift_minimum":
      return {
        title: `Drift >= ${data.minDriftPct}%`,
        subtitle: "Only act above drift threshold",
      };
    case "dca_buy":
      return {
        title: `Buy ${data.toSymbol}`,
        subtitle: data.amountUsd
          ? `$${data.amountUsd} from ${data.fromSymbol}`
          : `${data.fromSymbol} → ${data.toSymbol}`,
      };
    case "rebalance_to_target":
      return {
        title: "Rebalance to target",
        subtitle: `${data.targetAllocations.length} target weights`,
      };
    case "alert_only":
      return {
        title: data.title,
        subtitle: data.severity,
      };
    default: {
      const unknown = data as { type?: string };
      return {
        title: "Step",
        subtitle: unknown.type ?? "Unknown",
      };
    }
  }
}
