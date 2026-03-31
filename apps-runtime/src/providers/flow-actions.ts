/**
 * Flow Actions (Forte) — composable DeFi previews. Interfaces are beta (FLIP 339); this module returns structured plans only.
 */

export type FlowActionPrimitive = "source" | "sink" | "swapper" | "price_oracle" | "flasher";

export interface FlowActionsLeg {
  primitive: FlowActionPrimitive;
  protocol: string;
  note: string;
}

export interface FlowActionsCompositionPreview {
  mode: "preview";
  legs: FlowActionsLeg[];
  atomic: boolean;
  disclaimer: string;
}

export function buildDcaCompositionPreview(params: {
  fromSymbol: string;
  toSymbol: string;
  swapperProtocol: string;
}): FlowActionsCompositionPreview {
  return {
    mode: "preview",
    atomic: true,
    legs: [
      { primitive: "source", protocol: "vault", note: `Withdraw ${params.fromSymbol}` },
      { primitive: "swapper", protocol: params.swapperProtocol, note: `Swap to ${params.toSymbol}` },
      { primitive: "sink", protocol: "vault", note: `Deposit ${params.toSymbol}` },
    ],
    disclaimer:
      "Flow Actions connectors are network-specific. Submit only after testnet validation and audited connector addresses.",
  };
}

export function buildRebalanceCompositionPreview(params: {
  swapperProtocol: string;
  legCount: number;
}): FlowActionsCompositionPreview {
  const legs: FlowActionsLeg[] = [
    {
      primitive: "price_oracle",
      protocol: "dex_oracle",
      note: "Price reference for target weights",
    },
  ];
  for (let i = 0; i < params.legCount; i += 1) {
    legs.push({
      primitive: "swapper",
      protocol: params.swapperProtocol,
      note: `Rebalance leg ${i + 1}`,
    });
  }
  legs.push({ primitive: "sink", protocol: "vault", note: "Deposit to target allocation" });
  return {
    mode: "preview",
    atomic: true,
    legs,
    disclaimer: "Multi-leg rebalance preview only. Execution requires Flow Actions + connector deployment.",
  };
}

export function buildFlashLoanPreview(params: {
  flasherProtocol: string;
  swapperProtocol: string;
}): FlowActionsCompositionPreview {
  return {
    mode: "preview",
    atomic: true,
    legs: [
      { primitive: "flasher", protocol: params.flasherProtocol, note: "Borrow (must repay same tx)" },
      { primitive: "swapper", protocol: params.swapperProtocol, note: "Arbitrage / liquidation route" },
      { primitive: "sink", protocol: "vault", note: "Repay flash loan" },
    ],
    disclaimer: "Flash loans are high risk. Simulate on testnet; enforce guardrails in Rust before any mainnet path.",
  };
}
