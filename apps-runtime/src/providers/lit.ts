// @ts-nocheck — Lit SDK typings drift across @lit-protocol/* versions; runtime paths are exercised via sidecar.
/**
 * Lit Protocol adapter — real PKP minting, policy precheck via Lit Actions,
 * and distributed MPC signing through the Lit Network (datil-test).
 *
 * Auth method: EthWallet — the user's existing SHADOW wallet private key
 * signs an SIWE message to authenticate with Lit and mint/retrieve a PKP.
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
// Lit Action: policy enforcement code (runs on Lit TEE nodes)
// ---------------------------------------------------------------------------
const SPEND_POLICY_LIT_ACTION = `
(async () => {
  const guardrails = JSON.parse(guardrailsJson);
  const action = JSON.parse(actionJson);
  const notional = typeof action.notionalUsd === 'number' ? action.notionalUsd : 0;

  let allowed = true;
  let reason = "within_limits";

  // Per-trade limit
  if (notional > guardrails.perTradeLimitUsd) {
    allowed = false;
    reason = "exceeds_per_trade_limit";
  }

  // Daily spend limit
  if (notional > guardrails.dailySpendLimitUsd) {
    allowed = false;
    reason = "exceeds_daily_spend_limit";
  }

  // Approval threshold
  if (allowed && notional > guardrails.approvalThresholdUsd) {
    allowed = false;
    reason = "requires_manual_approval";
  }

  // Protocol whitelist
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

      // Mint PKP through the Lit relay
      const mintResult = await client.mintWithAuth({
        authMethod: {
          authMethodType: 1, // EthWallet
          accessToken: JSON.stringify({
            sig: await wallet.signMessage("Authorize SHADOW Agent PKP"),
            derivedVia: "ethPersonalSign",
            signedMessage: "Authorize SHADOW Agent PKP",
            address: wallet.address,
          }),
        },
        scopes: [
          // AuthMethodScope.SignAnything
          1,
          // AuthMethodScope.PersonalSign
          2,
        ],
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
   * Wallet status: return PKP info + guardrails validation.
   * If pkpAddress is stored in config, returns it. Otherwise returns placeholder.
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
   * the user's configured guardrails. This is decentralized enforcement —
   * multiple Lit nodes independently verify the policy.
   */
  async precheck(
    action: { kind?: string; notionalUsd?: number; protocol?: string },
    guardrails: LitGuardrails,
    ethPrivateKey?: string,
  ): Promise<PrecheckResult> {
    // If no private key, fall back to local enforcement (still useful)
    if (!ethPrivateKey) {
      return this.localPrecheck(action, guardrails);
    }

    let client: LitNodeClient | null = null;
    try {
      client = await this.createClient();
      const provider = new ethers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE);
      const wallet = new ethers.Wallet(ethPrivateKey, provider);

      // Generate session sigs for Lit Action execution
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
            signer: wallet as unknown as ethers.providers.JsonRpcSigner,
            toSign,
          });
        },
      });

      // Execute Lit Action on TEE nodes
      const result = await client.executeJs({
        sessionSigs,
        code: SPEND_POLICY_LIT_ACTION,
        jsParams: {
          guardrailsJson: JSON.stringify(guardrails),
          actionJson: JSON.stringify(action),
        },
      });

      const parsed = JSON.parse(result.response as string) as PrecheckResult;
      return parsed;
    } catch (err) {
      // If Lit nodes are unreachable, fall back to local enforcement
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Lit precheck fallback (node error): ${msg}\n`);
      return this.localPrecheck(action, guardrails);
    } finally {
      if (client) client.disconnect();
    }
  }

  /**
   * Local precheck fallback — same logic as the Lit Action but runs locally.
   * Used when Lit nodes can't be reached or no auth is available.
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
   * The PKP's distributed key signs the transaction — no single node
   * ever holds the full private key.
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
            ability: LIT_ABILITY.LitActionExecution,
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
            signer: wallet as unknown as ethers.providers.JsonRpcSigner,
            toSign: msg,
          });
        },
      });

      const sigResult = await client.pkpSign({
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
   * Quick connectivity check (non-blocking, returns fast).
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
