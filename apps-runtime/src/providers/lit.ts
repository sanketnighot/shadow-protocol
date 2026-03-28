import { LitNodeClient } from '@lit-protocol/lit-node-client';

export type LitGuardrails = {
  dailySpendLimitUsd: number;
  perTradeLimitUsd: number;
  approvalThresholdUsd: number;
  allowedProtocols: string[];
};

export class LitProvider {
  private async createClient() {
    const client = new LitNodeClient({
      litNetwork: 'datil-dev',
      debug: false,
    });
    await client.connect();
    return client;
  }

  async walletConnect() {
    const client = await this.createClient();
    try {
      // In a real scenario, this is where we would mint or retrieve a PKP via AuthSig.
      // For the scope of this hackathon baseline, we ensure Lit node connectivity.
      return {
        connected: client.ready,
        address: "0x0000000000000000000000000000000000000002",
        mode: "lit-node-client",
        note: "Connected via datil-dev Lit Network.",
      };
    } finally {
      client.disconnect();
    }
  }

  async walletStatus(guardrails: LitGuardrails) {
    const client = await this.createClient();
    try {
      return {
        mode: "vincent-shaped",
        connected: client.ready,
        address: "0x0000000000000000000000000000000000000002",
        guardrails,
      };
    } finally {
      client.disconnect();
    }
  }

  async precheck(action: { kind?: string; notionalUsd?: number }, guardrails: LitGuardrails) {
    const notional = typeof action.notionalUsd === 'number' ? action.notionalUsd : 0;
    
    // Enforcement of programmable policies
    let allowed = true;
    let reason = "within_shadow_limits";

    if (notional > guardrails.perTradeLimitUsd) {
      allowed = false;
      reason = "exceeds_per_trade_limit";
    }

    return {
      allowed,
      reason,
      reviewedNotionalUsd: notional,
      limitUsd: guardrails.perTradeLimitUsd,
      actionKind: action.kind ?? "unknown",
    };
  }
}

export const defaultLitProvider = new LitProvider();
