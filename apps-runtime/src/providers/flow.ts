import * as fcl from "@onflow/fcl";

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

/** Cadence read vs write: reads use REST only; writes may require session material in Rust. */
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
    apiKey?: string,
  ): Promise<{
    status: string;
    summary: string;
    cadencePreview: string;
    sponsorNote: string;
  }>;
}

export class FclFlowProvider implements FlowProvider {
  private testnetAccessNode = "https://rest-testnet.onflow.org";
  private mainnetAccessNode = "https://rest-mainnet.onflow.org";
  private currentNetwork: "testnet" | "mainnet" = "testnet";

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

  /**
   * Flow addresses are 8 bytes (16 hex chars) with optional 0x prefix (Cadence account).
   */
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

  async prepareSponsored(proposal: { summary?: string }, apiKey?: string) {
    if (!apiKey || apiKey.length < 8) {
      throw new Error("Unlock your SHADOW wallet session to prepare sponsored Flow transactions.");
    }

    return {
      status: "preview_only",
      summary: proposal.summary ?? "Flow transaction shell",
      cadencePreview: `transaction() {
  prepare(signer: AuthAccount) {}
  execute { log("Preview only — submit/sign path not yet wired to Cadence proposer/payer/authorizer roles") }
}`,
      sponsorNote:
        "SHADOW prepares a preview only. Production Cadence execution requires role-separated signing and audited sponsorship — not yet enabled in this build.",
    };
  }
}

export const defaultFlowProvider = new FclFlowProvider();
