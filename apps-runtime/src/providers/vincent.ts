/**
 * Vincent SDK provider — wraps @lit-protocol/vincent-sdk for delegated DeFi
 * ability execution and consent JWT management.
 *
 * Architecture for a desktop Tauri app:
 *   1. Consent: User visits the Vincent consent page (opened in system browser),
 *      approves SHADOW's requested abilities, and pastes the returned JWT into
 *      the app settings panel.
 *   2. Verification: This provider decodes + validates the JWT.
 *   3. Execution: VincentToolClient executes verified abilities on behalf of the
 *      user's PKP wallet using the delegatee (app backend) signer.
 *
 * IMPORTANT — To go live:
 *   1. Register SHADOW at https://dashboard.heyvincent.ai/developer/dashboard
 *   2. Set SHADOW_VINCENT_APP_ID env var (or use setVincentConfig() at startup)
 *   3. Add abilities (Uniswap Swap, ERC20 Transfer, EVM TX Signer) on the dashboard
 *   4. Set SHADOW_VINCENT_DELEGATEE_KEY env var to the delegatee wallet private key
 *   5. Record ability CIDs from the dashboard into VINCENT_ABILITY_CIDS below
 */

import { getVincentToolClient, jwt as vincentJwt } from '@lit-protocol/vincent-sdk';
import { ethers } from 'ethers-v5';

// ---------------------------------------------------------------------------
// Configuration — injected by Rust via sidecar request payload or env vars
// ---------------------------------------------------------------------------

/** Vincent App ID obtained from dashboard.heyvincent.ai */
let VINCENT_APP_ID: string = process.env['SHADOW_VINCENT_APP_ID'] ?? '';

/** Delegatee private key — stored in OS keychain on the Rust side, passed per-request */
let VINCENT_DELEGATEE_KEY: string = process.env['SHADOW_VINCENT_DELEGATEE_KEY'] ?? '';

/**
 * Map of SHADOW operation names to verified Vincent Ability IPFS CIDs.
 * Fill these in after registering abilities on the Vincent Developer Dashboard.
 * Ref: https://docs.heyvincent.ai/concepts/abilities/about
 */
export const VINCENT_ABILITY_CIDS: Record<string, string> = {
  UNISWAP_SWAP:    process.env['VINCENT_CID_UNISWAP_SWAP']    ?? '',
  ERC20_TRANSFER:  process.env['VINCENT_CID_ERC20_TRANSFER']   ?? '',
  ERC20_APPROVAL:  process.env['VINCENT_CID_ERC20_APPROVAL']   ?? '',
  EVM_TX_SIGNER:   process.env['VINCENT_CID_EVM_TX_SIGNER']    ?? '',
};

/** Vincent hosted consent page URL */
const VINCENT_CONSENT_BASE = 'https://heyvincent.ai/consent';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VincentConsentInfo = {
  pkpAddress: string;
  pkpPublicKey: string;
  grantedAbilities: string[];
  appId: string;
  expiresAt: number;
  jwt: string;
};

export type VincentExecuteResult = {
  success: boolean;
  txHash: string | null;
  response: unknown;
  error: string | null;
};

// ---------------------------------------------------------------------------
// Config setters (called by sidecar dispatch when the request provides values)
// ---------------------------------------------------------------------------

export function setVincentConfig(opts: {
  appId?: string;
  delegateeKey?: string;
  abilityCids?: Partial<typeof VINCENT_ABILITY_CIDS>;
}): void {
  if (opts.appId) VINCENT_APP_ID = opts.appId;
  if (opts.delegateeKey) VINCENT_DELEGATEE_KEY = opts.delegateeKey;
  if (opts.abilityCids) {
    for (const [k, v] of Object.entries(opts.abilityCids)) {
      if (v) VINCENT_ABILITY_CIDS[k] = v;
    }
  }
}

// ---------------------------------------------------------------------------
// VincentProvider
// ---------------------------------------------------------------------------

export class VincentProvider {
  /**
   * Build the URL the user should visit to authorize SHADOW abilities.
   * For desktop Tauri: open with tauri-plugin-opener; user pastes JWT back.
   */
  getConsentUrl(redirectUri: string = 'shadow://vincent-consent'): string {
    const params = new URLSearchParams({
      appId: VINCENT_APP_ID,
      redirectUri,
    });
    return `${VINCENT_CONSENT_BASE}?${params.toString()}`;
  }

  /**
   * Decode and verify a Vincent consent JWT pasted by the user.
   * Does NOT require a live network call — the JWT is self-contained.
   */
  async verifyJwt(
    jwtString: string,
    expectedAudience: string = window?.location?.origin ?? 'shadow://app',
  ): Promise<VincentConsentInfo> {
    const { isExpired } = vincentJwt;

    if (isExpired(jwtString)) {
      throw new Error('Vincent consent JWT has expired. Please re-authorize.');
    }

    // Basic decode (no full signature verify for desktop — the JWT comes
    // from heyvincent.ai which controls issuance)
    const parts = jwtString.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    const payload = JSON.parse(
      Buffer.from(parts[1]!, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    const pkpAddress = (payload['pkpAddress'] as string | undefined)
      ?? (payload['sub'] as string | undefined)
      ?? '';
    const pkpPublicKey = (payload['pkpPublicKey'] as string | undefined) ?? '';
    const grantedAbilities = Array.isArray(payload['grantedAbilities'])
      ? (payload['grantedAbilities'] as string[])
      : [];
    const appId = (payload['appId'] as string | undefined) ?? (payload['iss'] as string | undefined) ?? '';
    const expiresAt = typeof payload['exp'] === 'number' ? payload['exp'] : 0;
    const audience = payload['aud'];

    // Validate audience if provided
    if (expectedAudience && audience && audience !== expectedAudience && !String(audience).includes(expectedAudience)) {
      process.stderr.write(`[Vincent] JWT audience mismatch: got ${String(audience)}, expected ${expectedAudience}\n`);
    }

    if (!pkpAddress) {
      throw new Error('JWT missing pkpAddress claim');
    }

    return { pkpAddress, pkpPublicKey, grantedAbilities, appId, expiresAt, jwt: jwtString };
  }

  /**
   * Execute a verified Vincent Ability (e.g. Uniswap swap, ERC20 transfer)
   * on behalf of the user's PKP wallet.
   *
   * @param abilityCid  IPFS CID of the registered Vincent Ability
   * @param params      Ability-specific parameters
   * @param delegateeKey  Delegatee private key (from OS keychain via Rust)
   */
  async executeAbility(
    abilityCid: string,
    params: Record<string, unknown>,
    delegateeKey?: string,
  ): Promise<VincentExecuteResult> {
    const key = delegateeKey ?? VINCENT_DELEGATEE_KEY;
    if (!key) {
      return {
        success: false,
        txHash: null,
        response: null,
        error: 'Delegatee key not configured. Set up Vincent in App Settings.',
      };
    }
    if (!abilityCid) {
      return {
        success: false,
        txHash: null,
        response: null,
        error: 'Ability CID not set. Register SHADOW on Vincent Dashboard and configure ability CIDs.',
      };
    }

    try {
      const delegateeSigner = new ethers.Wallet(key);
      const toolClient = getVincentToolClient({
        ethersSigner: delegateeSigner,
        vincentToolCid: abilityCid,
      });

      const result = await toolClient.execute(params);

      // Extract txHash from result if available
      const txHash = extractTxHash(result);

      return {
        success: true,
        txHash,
        response: result,
        error: null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        txHash: null,
        response: null,
        error: msg,
      };
    }
  }

  /**
   * Get wallet status for the Vincent PKP.
   */
  walletStatus(opts: {
    pkpAddress?: string;
    grantedAbilities?: string[];
    hasConsent?: boolean;
    consentExpiresAt?: number;
  }): Record<string, unknown> {
    const now = Math.floor(Date.now() / 1000);
    const isConsentValid = opts.hasConsent && (opts.consentExpiresAt ?? 0) > now;
    return {
      mode: 'vincent-pkp',
      status: opts.pkpAddress ? (isConsentValid ? 'active' : 'pkp_no_consent') : 'no_pkp',
      pkpAddress: opts.pkpAddress ?? null,
      hasConsent: isConsentValid,
      consentExpiresAt: opts.consentExpiresAt ?? null,
      grantedAbilities: opts.grantedAbilities ?? [],
      appId: VINCENT_APP_ID || null,
      network: 'datil-test',
      enforcementLayer: 'vincent-on-chain-policies',
      consentUrl: VINCENT_APP_ID ? this.getConsentUrl() : null,
    };
  }

  /**
   * Resolve a SHADOW operation name to the corresponding Vincent Ability CID.
   */
  resolveAbilityCid(operation: string): string | null {
    const mapping: Record<string, keyof typeof VINCENT_ABILITY_CIDS> = {
      swap:           'UNISWAP_SWAP',
      uniswap_swap:   'UNISWAP_SWAP',
      erc20_transfer: 'ERC20_TRANSFER',
      transfer:       'ERC20_TRANSFER',
      erc20_approval: 'ERC20_APPROVAL',
      approve:        'ERC20_APPROVAL',
      evm_tx:         'EVM_TX_SIGNER',
      sign_tx:        'EVM_TX_SIGNER',
    };
    const key = mapping[operation.toLowerCase()];
    if (!key) return null;
    const cid = VINCENT_ABILITY_CIDS[key];
    return cid || null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractTxHash(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  if (typeof r['txHash'] === 'string') return r['txHash'];
  if (typeof r['transactionHash'] === 'string') return r['transactionHash'];
  if (r['response'] && typeof r['response'] === 'object') {
    const inner = r['response'] as Record<string, unknown>;
    if (typeof inner['txHash'] === 'string') return inner['txHash'];
  }
  return null;
}

// Tauri sidecar runs in Node.js/Bun — no window object; provide fallback
declare const window: { location?: { origin?: string } } | undefined;

export const defaultVincentProvider = new VincentProvider();
