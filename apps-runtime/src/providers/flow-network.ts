/**
 * Flow access node + core contract addresses (scheduled transactions / Forte).
 */

import { config } from "@onflow/config";
import * as fcl from "@onflow/fcl";

export type FlowNetworkId = "testnet" | "mainnet";

const ACCESS_NODES: Record<FlowNetworkId, string> = {
  testnet: "https://rest-testnet.onflow.org",
  mainnet: "https://rest-mainnet.onflow.org",
};

/** FlowTransactionScheduler deployment (Cadence) — see Flow developer docs. */
export const FLOW_TRANSACTION_SCHEDULER: Record<FlowNetworkId, string> = {
  testnet: "0x8c5303eaa26202d6",
  mainnet: "0xe467b9dd11fa00df",
};

export function accessNodeRestUrl(network: FlowNetworkId): string {
  return ACCESS_NODES[network];
}

export function configureFclNetwork(network: FlowNetworkId): void {
  const url = ACCESS_NODES[network];
  fcl.config().put("accessNode.api", url).put("flow.network", network);
  config().put("accessNode.api", url).put("flow.network", network);
}

export function schedulerImportAddress(network: FlowNetworkId): string {
  return FLOW_TRANSACTION_SCHEDULER[network];
}
