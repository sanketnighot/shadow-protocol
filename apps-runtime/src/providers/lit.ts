/**
 * Lit Protocol adapter — raw PKP minting, policy precheck via Lit Actions,
 * and distributed MPC signing through the Lit Network (datil-test).
 *
 * Auth method: EthWallet — the user's existing SHADOW wallet private key
 * signs an SIWE message to authenticate with Lit and mint/retrieve a PKP.
 *
 * NOTE: This provider uses raw Lit primitives. Higher-level operations
 * (DeFi ability execution, consent management) live in vincent.ts.
 */

import { LitNodeClient } from '@lit-protocol/lit-node-client';
import { LitNetwork, LIT_RPC } from '@lit-protocol/constants';
import { ethers } from 'ethers';
import {
  LitAbility,
  LitActionResource,
  createSiweMessageWithResources,
  generateAuthSig,
} from '@lit-protocol/auth-helpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type LitGuardrails = {
  dailySpendLimitUsd: number;
  perTradeLimitUsd: number;
  approvalThresholdUsd: number;
  allowedProtocols: string[];
};

export type MintPkpResult = {
  pkpPublicKey: string;
  pkpEthAddress: string;
  tokenId: string;
  txHash: string;
};

export type PrecheckResult = {
  allowed: boolean;
  reason: string;
  reviewedNotionalUsd: number;
  limitUsd: number;
  actionKind: string;
  enforcedBy: string;
};

export type ExecuteResult = {
  success: boolean;
  txHash: string | null;
  signedData: unknown;
  error: string | null;
};

// ---------------------------------------------------------------------------
// Lit Action: local spend-policy enforcement (runs on Lit TEE nodes when key available,
// falls back to local when not). Vincent on-chain policies supersede this when
// the Vincent consent flow is active.
// ---------------------------------------------------------------------------
const SPEND_POLICY_LIT_ACTION = `
(async () => {
  const guardrails = JSON.parse(guardrailsJson);
  const action = JSON.parse(actionJson);
  const notional = typeof action.notionalUsd === 'number' ? action.notionalUsd : 0;

  let allowed = true;
  let reason = "within_limits";

  if (notional > guardrails.perTradeLimitUsd) {
    allowed = false;
    reason = "exceeds_per_trade_limit";
  }

  if (notional > guardrails.dailySpendLimitUsd) {
    allowed = false;
    reason = "exceeds_daily_spend_limit";
  }

  if (allowed && notional > guardrails.approvalThresholdUsd) {
    allowed = false;
    reason = "requires_manual_approval";
  }

  if (allowed && action.protocol) {
    const whitelist = guardrails.allowedProtocols || [];
    if (whitelist.length > 0 && !whitelist.includes(action.protocol)) {
      allowed = false;
      reason = "protocol_not_whitelisted";
    }
  }

  Lit.Actions.setResponse({
    response: JSON.stringify({
      allowed,
      reason,
      reviewedNotionalUsd: notional,
      limitUsd: guardrails.perTradeLimitUsd,
      actionKind: action.kind || "unknown",
      enforcedBy: "lit-tee-nodes"
    })
  });
})();
`;

// ---------------------------------------------------------------------------
// LitProvider
// ---------------------------------------------------------------------------
export class LitProvider {
  private litNetwork = LitNetwork.DatilTest;

  private async createClient(): Promise<LitNodeClient> {
    const client = new LitNodeClient({
      litNetwork: this.litNetwork,
      debug: false,
    });
    await client.connect();
    return client;
  }

  /**
   * Mint a new PKP using the user's Ethereum wallet (EthWallet auth method).
   * The user's private key signs an SIWE message — no WebAuthn needed.
   */
  async mintPkp(ethPrivateKey: string): Promise<MintPkpResult> {
    const client = await this.createClient();
    try {
      const provider = new ethers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE);
      const wallet = new ethers.Wallet(ethPrivateKey, provider);

      const mintResult = await (client as unknown as {
        mintWithAuth(opts: unknown): Promise<{ pkp?: { publicKey?: string; ethAddress?: string; tokenId?: string }; tx?: string }>;
      }).mintWithAuth({
        authMethod: {
          authMethodType: 1, // EthWallet
          accessToken: JSON.stringify({
            sig: await wallet.signMessage("Authorize SHADOW Agent PKP"),
            derivedVia: "ethPersonalSign",
            signedMessage: "Authorize SHADOW Agent PKP",
            address: wallet.address,
          }),
        },
        scopes: [1, 2], // SignAnything, PersonalSign
      });

      return {
        pkpPublicKey: mintResult.pkp?.publicKey ?? '',
        pkpEthAddress: mintResult.pkp?.ethAddress ?? '',
        tokenId: mintResult.pkp?.tokenId ?? '',
        txHash: mintResult.tx ?? '',
      };
    } finally {
      client.disconnect();
    }
  }

  /**
   * Wallet status: return PKP info + guardrails.
   */
  async walletStatus(guardrails: LitGuardrails, pkpAddress?: string): Promise<Record<string, unknown>> {
    return {
      mode: "vincent-pkp",
      status: pkpAddress ? "active" : "no_pkp",
      pkpAddress: pkpAddress ?? null,
      guardrails: {
        dailySpendLimitUsd: guardrails.dailySpendLimitUsd,
        perTradeLimitUsd: guardrails.perTradeLimitUsd,
        approvalThresholdUsd: guardrails.approvalThresholdUsd,
        allowedProtocols: guardrails.allowedProtocols,
      },
      network: "datil-test",
      enforcementLayer: "lit-tee-distributed",
    };
  }

  /**
   * Run a Lit Action on TEE nodes to validate the proposed action against
   * the user's configured guardrails. Falls back to local enforcement when
   * Lit nodes are unreachable or no auth is available.
   */
  async precheck(
    action: { kind?: string; notionalUsd?: number; protocol?: string },
    guardrails: LitGuardrails,
    ethPrivateKey?: string,
  ): Promise<PrecheckResult> {
    if (!ethPrivateKey) {
      return this.localPrecheck(action, guardrails);
    }

    let client: LitNodeClient | null = null;
    try {
      client = await this.createClient();
      const provider = new ethers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE);
      const wallet = new ethers.Wallet(ethPrivateKey, provider);

      const sessionSigs = await client.getSessionSigs({
        chain: 'ethereum',
        expiration: new Date(Date.now() + 1000 * 60 * 10).toISOString(),
        resourceAbilityRequests: [
          {
            resource: new LitActionResource('*'),
            ability: LitAbility.LitActionExecution,
          },
        ],
        authNeededCallback: async (params) => {
          const toSign = await createSiweMessageWithResources({
            uri: params.uri!,
            expiration: params.expiration!,
            resources: params.resourceAbilityRequests!,
            walletAddress: wallet.address,
            nonce: await client!.getLatestBlockhash(),
          });
          return await generateAuthSig({
            signer: wallet as unknown as Parameters<typeof generateAuthSig>[0]['signer'],
            toSign,
          });
        },
      });

      const result = await client.executeJs({
        sessionSigs,
        code: SPEND_POLICY_LIT_ACTION,
        jsParams: {
          guardrailsJson: JSON.stringify(guardrails),
          actionJson: JSON.stringify(action),
        },
      });

      return JSON.parse(result.response as string) as PrecheckResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Lit precheck fallback (node error): ${msg}\n`);
      return this.localPrecheck(action, guardrails);
    } finally {
      if (client) client.disconnect();
    }
  }

  /**
   * Local precheck fallback — same logic as the Lit Action.
   */
  private localPrecheck(
    action: { kind?: string; notionalUsd?: number; protocol?: string },
    guardrails: LitGuardrails,
  ): PrecheckResult {
    const notional = typeof action.notionalUsd === 'number' ? action.notionalUsd : 0;
    let allowed = true;
    let reason = "within_limits";

    if (notional > guardrails.perTradeLimitUsd) {
      allowed = false;
      reason = "exceeds_per_trade_limit";
    }
    if (notional > guardrails.dailySpendLimitUsd) {
      allowed = false;
      reason = "exceeds_daily_spend_limit";
    }
    if (allowed && notional > guardrails.approvalThresholdUsd) {
      allowed = false;
      reason = "requires_manual_approval";
    }
    if (allowed && action.protocol) {
      const whitelist = guardrails.allowedProtocols;
      if (whitelist.length > 0 && !whitelist.includes(action.protocol)) {
        allowed = false;
        reason = "protocol_not_whitelisted";
      }
    }

    return {
      allowed,
      reason,
      reviewedNotionalUsd: notional,
      limitUsd: guardrails.perTradeLimitUsd,
      actionKind: action.kind ?? "unknown",
      enforcedBy: "local-fallback",
    };
  }

  /**
   * Execute a transaction via PKP signing on Lit's MPC network.
   */
  async executePkpSign(
    ethPrivateKey: string,
    pkpPublicKey: string,
    toSign: string,
  ): Promise<ExecuteResult> {
    let client: LitNodeClient | null = null;
    try {
      client = await this.createClient();
      const provider = new ethers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE);
      const wallet = new ethers.Wallet(ethPrivateKey, provider);

      const sessionSigs = await client.getSessionSigs({
        chain: 'ethereum',
        expiration: new Date(Date.now() + 1000 * 60 * 10).toISOString(),
        resourceAbilityRequests: [
          {
            resource: new LitActionResource('*'),
            ability: LitAbility.LitActionExecution,
          },
        ],
        authNeededCallback: async (params) => {
          const msg = await createSiweMessageWithResources({
            uri: params.uri!,
            expiration: params.expiration!,
            resources: params.resourceAbilityRequests!,
            walletAddress: wallet.address,
            nonce: await client!.getLatestBlockhash(),
          });
          return await generateAuthSig({
            signer: wallet as unknown as Parameters<typeof generateAuthSig>[0]['signer'],
            toSign: msg,
          });
        },
      });

      const sigResult = await (client as unknown as {
        pkpSign(opts: unknown): Promise<unknown>;
      }).pkpSign({
        pubKey: pkpPublicKey,
        toSign: ethers.getBytes(toSign),
        sessionSigs,
      });

      return {
        success: true,
        txHash: null,
        signedData: sigResult,
        error: null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        txHash: null,
        signedData: null,
        error: msg,
      };
    } finally {
      if (client) client.disconnect();
    }
  }

  /**
   * Quick connectivity check.
   */
  async connectivityCheck(): Promise<Record<string, unknown>> {
    try {
      const client = await this.createClient();
      const ready = client.ready;
      client.disconnect();
      return {
        connected: ready,
        network: "datil-test",
        mode: "lit-node-client",
        note: "Connected to Lit datil-test network. PKPs can be minted and policies enforced.",
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        connected: false,
        network: "datil-test",
        mode: "error",
        note: msg,
      };
    }
  }
}

export const defaultLitProvider = new LitProvider();
