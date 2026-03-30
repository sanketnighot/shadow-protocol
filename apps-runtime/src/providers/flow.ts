import * as fcl from '@onflow/fcl';

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

export interface FlowProvider {
  accountStatus(apiKey?: string): Promise<{ connected: boolean; address: string | null; network: string }>;
  fetchBalances(address: string, apiKey?: string): Promise<FlowAsset[]>;
  prepareSponsored(proposal: { summary?: string }, apiKey?: string): Promise<{ status: string; summary: string; cadencePreview: string; sponsorNote: string }>;
}

export class FclFlowProvider implements FlowProvider {
  private testnetAccessNode = 'https://rest-testnet.onflow.org';
  private mainnetAccessNode = 'https://rest-mainnet.onflow.org';
  private currentNetwork: 'testnet' | 'mainnet' = 'testnet';

  constructor() {
    fcl.config()
      .put("accessNode.api", this.testnetAccessNode)
      .put("flow.network", this.currentNetwork);
  }

  private getAccessNode(): string {
    return this.currentNetwork === 'mainnet' ? this.mainnetAccessNode : this.testnetAccessNode;
  }

  async accountStatus(apiKey?: string): Promise<{ connected: boolean; address: string | null; network: string }> {
    if (!apiKey) {
      throw new Error("Missing unlocked SHADOW wallet session. Please unlock your wallet to interact with Flow.");
    }

    return {
      connected: true,
      address: "0xAgentNodeAddress",
      network: this.currentNetwork,
    };
  }

  /**
   * Check if an address looks like a Flow address
   * Flow addresses are 8 bytes (16 hex chars) with optional 0x prefix
   */
  private isFlowAddress(address: string): boolean {
    const clean = address.startsWith('0x') ? address.slice(2) : address;
    // Flow addresses are exactly 16 hex characters (8 bytes)
    return clean.length === 16 && /^[0-9a-fA-F]+$/.test(clean);
  }

  /**
   * Fetch Flow account balances using Flow's REST API
   * This fetches native FLOW token balance and can be extended to query fungible token balances
   */
  async fetchBalances(address: string, apiKey?: string): Promise<FlowAsset[]> {
    console.error(`[Flow] fetchBalances called for address: ${address}`);

    if (!address) {
      console.error('[Flow] Error: Empty address provided');
      return [];
    }

    // Validate this looks like a Flow address
    if (!this.isFlowAddress(address)) {
      console.error(`[Flow] Error: Address ${address} does not look like a Flow address (expected 16 hex chars)`);
      // Still try to fetch - maybe it's valid
    }

    try {
      // Normalize Flow address (add 0x prefix if missing)
      const normalizedAddress = address.startsWith('0x') ? address : `0x${address}`;
      const accessNode = this.getAccessNode();
      const url = `${accessNode}/v1/accounts/${normalizedAddress}`;

      console.error(`[Flow] Fetching from: ${url}`);

      // Fetch account info from Flow REST API
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.error(`[Flow] Response status: ${response.status}`);

      if (!response.ok) {
        if (response.status === 404) {
          console.error(`[Flow] Account ${normalizedAddress} not found on ${this.currentNetwork}`);
          return [];
        }
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`[Flow] API error response: ${errorText}`);
        throw new Error(`Flow API error: ${response.status} - ${errorText}`);
      }

      const account: FlowAccountInfo = await response.json();
      console.error(`[Flow] Account data received:`, JSON.stringify(account, null, 2));

      const assets: FlowAsset[] = [];

      // Add native FLOW token
      const flowBalance = account.balance || '0';
      const formattedBalance = this.formatBalance(flowBalance, 8);
      console.error(`[Flow] Native FLOW balance: ${flowBalance} -> ${formattedBalance}`);

      assets.push({
        address: null,
        symbol: 'FLOW',
        name: 'Flow',
        balance: formattedBalance,
        decimals: 8,
        chain: this.currentNetwork === 'mainnet' ? 'flow-mainnet' : 'flow-testnet',
      });

      return assets;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Flow] Failed to fetch Flow balances for ${address}:`, message);
      throw error;
    }
  }

  private formatBalance(rawBalance: string | number, decimals: number): string {
    // Flow API returns balance as a hex string (e.g., "0x123abc") or decimal string
    let balance: number;
    if (typeof rawBalance === 'string') {
      // Check if it's a hex string
      if (rawBalance.startsWith('0x') || rawBalance.startsWith('0X')) {
        balance = parseInt(rawBalance, 16);
      } else {
        balance = parseFloat(rawBalance);
      }
    } else {
      balance = rawBalance;
    }

    if (isNaN(balance)) {
      console.error(`[Flow] Invalid balance value: ${rawBalance}`);
      return '0.000000';
    }

    // Flow uses 8 decimals (not 18 like Ethereum)
    // The API returns the balance in the smallest unit (attoflow-like, but Flow actually uses 10^8)
    const formatted = balance / Math.pow(10, decimals);
    console.error(`[Flow] formatBalance: ${rawBalance} -> ${balance} / 10^${decimals} = ${formatted}`);
    return formatted.toFixed(6);
  }

  async prepareSponsored(proposal: { summary?: string }, apiKey?: string) {
    if (!apiKey) {
      throw new Error("Missing unlocked SHADOW wallet session.");
    }

    return {
      status: "prepared_and_sponsored",
      summary: proposal.summary ?? "Flow transaction shell",
      cadencePreview: `transaction() {
  prepare(signer: AuthAccount) {}
  execute { log("Authorized directly by SHADOW Wallet Session keys via FCL mapping") }
}`,
      sponsorNote: "Transaction payload is bound seamlessly using your active SHADOW protocol wallet.",
    };
  }

  /**
   * Set the network for Flow operations
   */
  setNetwork(network: 'testnet' | 'mainnet') {
    this.currentNetwork = network;
    const accessNode = network === 'mainnet' ? this.mainnetAccessNode : this.testnetAccessNode;
    fcl.config()
      .put("accessNode.api", accessNode)
      .put("flow.network", network);
  }
}

export const defaultFlowProvider = new FclFlowProvider();
