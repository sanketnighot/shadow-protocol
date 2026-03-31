/**
 * Cross-VM (Cadence ↔ Flow EVM) bridge — preview metadata. Bridging must be initiated from Cadence per Flow docs.
 */

export type BridgeDirection = "cadence_to_evm" | "evm_to_cadence";

export interface FlowBridgePreview {
  direction: BridgeDirection;
  tokenRef: string;
  amountHint: string;
  note: string;
  docRef: string;
}

export function bridgePreview(params: {
  direction: BridgeDirection;
  tokenRef: string;
  amountHint: string;
}): FlowBridgePreview {
  return {
    direction: params.direction,
    tokenRef: params.tokenRef,
    amountHint: params.amountHint,
    note:
      "Cross-VM bridge moves are initiated via Cadence transactions against Flow VM bridge contracts. Validate token type associations on testnet before mainnet.",
    docRef: "https://developers.flow.com/tutorials/cross-vm-apps/vm-bridge",
  };
}

export function listBridgeableHints(): string[] {
  return [
    "ERC-20 on Flow EVM may map to Cadence FT via bridge associations.",
    "Always confirm contract addresses per network in official Flow bridge documentation.",
  ];
}
