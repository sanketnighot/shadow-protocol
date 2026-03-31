import * as fcl from "@onflow/fcl";

import { configureFclNetwork, schedulerImportAddress, type FlowNetworkId } from "./flow-network.js";
import {
  getTransactionStatus,
  runCadenceScript,
  submitCadenceWithSessionKey,
} from "./flow-tx.js";

export interface FlowAsset {
  address: string | null;
  symbol: string;
  name: string;
  balance: string;
  decimals: number;
  chain: string;
}

export interface FlowAccountInfo {
  address: string;
  balance: string;
  contracts: Record<string, unknown>;
}

/** Cadence read vs write: reads use REST only; writes use session key in isolated sidecar process. */
export interface FlowProvider {
  setNetwork(network: "testnet" | "mainnet"): void;
  accountStatus(): Promise<{
    connected: boolean;
    address: string | null;
    network: string;
    surface: "cadence";
  }>;
  fetchBalances(address: string, network?: string): Promise<FlowAsset[]>;
  prepareSponsored(
    proposal: { summary?: string },
    sessionMaterial?: string,
    cadenceAddress?: string,
  ): Promise<{
    status: string;
    summary: string;
    cadencePreview: string;
    sponsorNote: string;
    txId?: string;
  }>;
  estimateScheduleFee(params: {
    network: FlowNetworkId;
    executionEffort: number;
    priorityRaw: number;
    dataSizeMB: string;
  }): Promise<{ feeFlow: string; note: string }>;
  /** On-chain audit log of scheduling intent; full FlowTransactionScheduler.schedule requires a deployed TransactionHandler. */
  submitScheduleIntent(params: {
    network: FlowNetworkId;
    privateKeyHex: string;
    cadenceAddress: string;
    intentJson: string;
    keyId?: number;
  }): Promise<{ txId: string; note: string }>;
  submitCronIntent(params: {
    network: FlowNetworkId;
    privateKeyHex: string;
    cadenceAddress: string;
    cronExpression: string;
    keyId?: number;
  }): Promise<{ txId: string; note: string }>;
  /** On-chain audit log tied to a prior submitted tx id (manager cancel still TBD). */
  submitCancelIntent(params: {
    network: FlowNetworkId;
    privateKeyHex: string;
    cadenceAddress: string;
    targetTxId: string;
    keyId?: number;
  }): Promise<{ txId: string; note: string }>;
  getTxStatus(txId: string): Promise<Record<string, unknown>>;
}

const MINIMAL_PREPARE_CADENCE = `
transaction {
  prepare(signer: auth(Storage) &Account) {
    log("shadow_flow_signing_ok")
  }
}
`.trim();

const INTENT_CADENCE = `
transaction(intent: String) {
  prepare(signer: auth(Storage) &Account) {
    log(intent)
  }
}
`.trim();

export class FclFlowProvider implements FlowProvider {
  private testnetAccessNode = "https://rest-testnet.onflow.org";
  private mainnetAccessNode = "https://rest-mainnet.onflow.org";
  private currentNetwork: FlowNetworkId = "testnet";

  constructor() {
    fcl
      .config()
      .put("accessNode.api", this.testnetAccessNode)
      .put("flow.network", this.currentNetwork);
  }

  private getAccessNode(): string {
    return this.currentNetwork === "mainnet" ? this.mainnetAccessNode : this.testnetAccessNode;
  }

  setNetwork(network: "testnet" | "mainnet"): void {
    this.currentNetwork = network;
    const accessNode = network === "mainnet" ? this.mainnetAccessNode : this.testnetAccessNode;
    fcl.config().put("accessNode.api", accessNode).put("flow.network", network);
  }

  async accountStatus(): Promise<{
    connected: boolean;
    address: string | null;
    network: string;
    surface: "cadence";
  }> {
    const accessNode = this.getAccessNode();
    try {
      const res = await fetch(`${accessNode}/v1/network/parameters`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      return {
        connected: res.ok,
        address: null,
        network: this.currentNetwork,
        surface: "cadence",
      };
    } catch {
      return {
        connected: false,
        address: null,
        network: this.currentNetwork,
        surface: "cadence",
      };
    }
  }

  private isFlowAddress(address: string): boolean {
    const clean = address.startsWith("0x") ? address.slice(2) : address;
    return clean.length === 16 && /^[0-9a-fA-F]+$/.test(clean);
  }

  async fetchBalances(address: string, network?: string): Promise<FlowAsset[]> {
    if (network === "mainnet" || network === "testnet") {
      this.setNetwork(network);
    }

    if (!address) {
      return [];
    }

    if (!this.isFlowAddress(address)) {
      throw new Error("Expected a Cadence Flow address (16 hex characters, optional 0x prefix).");
    }

    try {
      const normalizedAddress = address.startsWith("0x") ? address : `0x${address}`;
      const accessNode = this.getAccessNode();
      const url = `${accessNode}/v1/accounts/${normalizedAddress}`;

      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return [];
        }
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`Flow API error: ${response.status} - ${errorText}`);
      }

      const account: FlowAccountInfo = await response.json();

      const assets: FlowAsset[] = [];

      const flowBalance = account.balance || "0";
      const formattedBalance = this.formatBalance(flowBalance, 8);

      assets.push({
        address: null,
        symbol: "FLOW",
        name: "Flow",
        balance: formattedBalance,
        decimals: 8,
        chain: this.currentNetwork === "mainnet" ? "flow-mainnet" : "flow-testnet",
      });

      return assets;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to fetch Flow balances: ${message}`);
    }
  }

  private formatBalance(rawBalance: string | number, decimals: number): string {
    let balance: number;
    if (typeof rawBalance === "string") {
      if (rawBalance.startsWith("0x") || rawBalance.startsWith("0X")) {
        balance = parseInt(rawBalance, 16);
      } else {
        balance = parseFloat(rawBalance);
      }
    } else {
      balance = rawBalance;
    }

    if (Number.isNaN(balance)) {
      return "0.000000";
    }

    const formatted = balance / Math.pow(10, decimals);
    return formatted.toFixed(6);
  }

  async prepareSponsored(
    proposal: { summary?: string },
    sessionMaterial?: string,
    cadenceAddress?: string,
  ) {
    const pk = sessionMaterial?.trim() ?? "";
    if (!pk || pk.length < 32) {
      throw new Error("Unlock your SHADOW wallet session to prepare or sign Flow transactions.");
    }

    const previewCadence = MINIMAL_PREPARE_CADENCE;
    if (cadenceAddress && this.isFlowAddress(cadenceAddress)) {
      try {
        const { txId } = await submitCadenceWithSessionKey({
          network: this.currentNetwork,
          cadence: MINIMAL_PREPARE_CADENCE,
          args: () => [],
          privateKeyHex: pk,
          cadenceAddress,
          limit: 120,
        });
        return {
          status: "signed_submitted",
          summary: proposal.summary ?? "Flow signing verification",
          cadencePreview: previewCadence,
          sponsorNote:
            "Submitted a minimal Cadence transaction to verify proposer/payer/authorizer signing. Full FlowTransactionScheduler flows require a deployed TransactionHandler on your account.",
          txId,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "sign_failed";
        throw new Error(`Flow signing or submit failed: ${msg}`);
      }
    }

    return {
      status: "preview_only",
      summary: proposal.summary ?? "Flow transaction shell",
      cadencePreview: previewCadence,
      sponsorNote:
        "Set cadenceAddress in Flow app settings to submit a minimal signing check. Full scheduled transactions need FlowTransactionScheduler + TransactionHandler resources.",
    };
  }

  async estimateScheduleFee(params: {
    network: FlowNetworkId;
    executionEffort: number;
    priorityRaw: number;
    dataSizeMB: string;
  }): Promise<{ feeFlow: string; note: string }> {
    configureFclNetwork(params.network);
    const addr = schedulerImportAddress(params.network);
    const cadence = `
import FlowTransactionScheduler from ${addr}

access(all) fun main(
  executionEffort: UInt64,
  priorityRaw: UInt8,
  dataSizeMB: UFix64,
): UFix64 {
  let priority = FlowTransactionScheduler.Priority(rawValue: priorityRaw)
    ?? FlowTransactionScheduler.Priority.Medium
  return FlowTransactionScheduler.calculateFee(
    executionEffort: executionEffort,
    priority: priority,
    dataSizeMB: dataSizeMB
  )
}
`.trim();

    try {
      const fee = await runCadenceScript<string | number>({
        network: params.network,
        cadence,
        args: (arg, t) => [
          arg(String(params.executionEffort), t.UInt64),
          arg(String(params.priorityRaw), t.UInt8),
          arg(params.dataSizeMB, t.UFix64),
        ],
      });
      return {
        feeFlow: String(fee),
        note: "Fee from FlowTransactionScheduler.calculateFee (UFix64). Pay from Flow vault when scheduling.",
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "estimate_failed";
      throw new Error(`Flow schedule fee query failed: ${msg}`);
    }
  }

  async submitScheduleIntent(params: {
    network: FlowNetworkId;
    privateKeyHex: string;
    cadenceAddress: string;
    intentJson: string;
    keyId?: number;
  }): Promise<{ txId: string; note: string }> {
    if (!this.isFlowAddress(params.cadenceAddress)) {
      throw new Error("Invalid Cadence Flow address.");
    }
    const intent = params.intentJson.length > 512 ? params.intentJson.slice(0, 512) : params.intentJson;
    const { txId } = await submitCadenceWithSessionKey({
      network: params.network,
      cadence: INTENT_CADENCE,
      args: (arg, t) => [arg(`SHADOW_SCHEDULE:${intent}`, t.String)],
      privateKeyHex: params.privateKeyHex,
      cadenceAddress: params.cadenceAddress,
      keyId: params.keyId,
      limit: 200,
    });
    return {
      txId,
      note: "Logged scheduling intent on-chain. Wire FlowTransactionScheduler.schedule with your TransactionHandler for autonomous execution.",
    };
  }

  async submitCronIntent(params: {
    network: FlowNetworkId;
    privateKeyHex: string;
    cadenceAddress: string;
    cronExpression: string;
    keyId?: number;
  }): Promise<{ txId: string; note: string }> {
    const payload = JSON.stringify({
      kind: "flow_cron",
      cron: params.cronExpression,
    });
    return this.submitScheduleIntent({
      network: params.network,
      privateKeyHex: params.privateKeyHex,
      cadenceAddress: params.cadenceAddress,
      intentJson: payload,
      keyId: params.keyId,
    });
  }

  async submitCancelIntent(params: {
    network: FlowNetworkId;
    privateKeyHex: string;
    cadenceAddress: string;
    targetTxId: string;
    keyId?: number;
  }): Promise<{ txId: string; note: string }> {
    const tid = params.targetTxId.trim();
    if (!tid) {
      throw new Error("targetTxId required");
    }
    const { txId } = await submitCadenceWithSessionKey({
      network: params.network,
      cadence: INTENT_CADENCE,
      args: (arg, t) => [arg(`SHADOW_CANCEL:${tid}`, t.String)],
      privateKeyHex: params.privateKeyHex,
      cadenceAddress: params.cadenceAddress,
      keyId: params.keyId,
      limit: 200,
    });
    return {
      txId,
      note: "Logged cancel intent on-chain. Full FlowTransactionScheduler manager cancel still requires deployed resources.",
    };
  }

  async getTxStatus(txId: string): Promise<Record<string, unknown>> {
    return getTransactionStatus(txId.trim());
  }
}

export const defaultFlowProvider = new FclFlowProvider();
