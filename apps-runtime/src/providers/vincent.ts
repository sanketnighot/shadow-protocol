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

/** Vincent user connect URL — JWT returned on `redirectUri` after auth (dashboard user flow). */
const VINCENT_DASHBOARD_USER_CONNECT = 'https://dashboard.heyvincent.ai/user/appId';

function isEvmAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

/**
 * HeyVincent login uses Stytch; the `authenticate` response `session_jwt` is NOT
 * a Vincent consent token. Users often paste it from DevTools by mistake.
 */
function isStytchOrWebLoginSessionPayload(payload: Record<string, unknown>): boolean {
  const iss = payload['iss'];
  if (typeof iss === 'string' && iss.includes('stytch')) {
    return true;
  }
  if (payload['https://stytch.com/session'] != null) {
    return true;
  }
  const sub = payload['sub'];
  if (typeof sub === 'string' && /^user-(live|test)-/i.test(sub)) {
    return true;
  }
  return false;
}

/** Sidecar runs in Node — never reference global `window` (ReferenceError). */
function resolveJwtExpectedAudience(explicit?: string): string {
  if (typeof explicit === 'string' && explicit.trim() !== '') {
    return explicit.trim();
  }
  const w = (globalThis as unknown as { window?: { location?: { origin?: string } } }).window;
  const origin = w?.location?.origin;
  if (typeof origin === 'string' && origin.trim() !== '') {
    return origin.trim();
  }
  return 'shadow://app';
}

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
    if (!VINCENT_APP_ID.trim()) {
      throw new Error('Vincent App ID is not configured.');
    }
    const id = VINCENT_APP_ID.trim();
    const enc = encodeURIComponent(redirectUri);
    return `${VINCENT_DASHBOARD_USER_CONNECT}/${id}/connect?redirectUri=${enc}`;
  }

  /**
   * Decode and verify a Vincent consent JWT pasted by the user.
   * Does NOT require a live network call — the JWT is self-contained.
   */
  async verifyJwt(jwtString: string, expectedAudience?: string): Promise<VincentConsentInfo> {
    const audienceExpected = resolveJwtExpectedAudience(expectedAudience);
    const parts = jwtString.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(
        Buffer.from(parts[1]!, 'base64url').toString('utf8'),
      ) as Record<string, unknown>;
    } catch {
      throw new Error('Invalid JWT payload');
    }

    if (isStytchOrWebLoginSessionPayload(payload)) {
      throw new Error(
        'That JWT is a HeyVincent login session token (Stytch), not a Vincent consent token. ' +
          'Do not paste session_jwt from the authenticate network response.',
      );
    }

    // Check expiry directly from the payload (SDK isExpired() may throw on new JWT shapes).
    const nowSecs = Math.floor(Date.now() / 1000);
    const expiresAt = typeof payload['exp'] === 'number' ? payload['exp'] : 0;
    if (expiresAt > 0 && nowSecs > expiresAt) {
      throw new Error('Vincent consent JWT has expired. Please re-authorize.');
    }

    // Vincent API v1 puts PKP info inside `pkpInfo.ethAddress`.
    // Older/alternative shapes use top-level `pkpAddress`, `sub`, or `iss`.
    const pkpInfoRaw = payload['pkpInfo'];
    const pkpInfo =
      pkpInfoRaw && typeof pkpInfoRaw === 'object' ? (pkpInfoRaw as Record<string, unknown>) : null;

    let pkpAddress = '';
    const candidates = [
      pkpInfo?.['ethAddress'],
      payload['pkpAddress'],
      payload['sub'],
      payload['iss'],
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && isEvmAddress(c)) {
        pkpAddress = c.trim();
        break;
      }
    }

    const pkpPublicKey =
      (pkpInfo && typeof pkpInfo['publicKey'] === 'string' ? pkpInfo['publicKey'] : '') ||
      (typeof payload['pkpPublicKey'] === 'string' ? payload['pkpPublicKey'] : '') ||
      (typeof payload['publicKey'] === 'string' ? payload['publicKey'] : '');

    // Granted abilities may be absent in Vincent API v1 (server-side policies).
    const grantedAbilities = Array.isArray(payload['grantedAbilities'])
      ? (payload['grantedAbilities'] as string[])
      : [];

    // App ID: explicit field, nested app.id, or issuer.
    const appNested = payload['app'];
    const appNestedId =
      appNested && typeof appNested === 'object'
        ? String((appNested as Record<string, unknown>)['id'] ?? '')
        : '';
    const appId =
      (typeof payload['appId'] === 'string' ? payload['appId'] : '') ||
      appNestedId ||
      '';

    const audience = payload['aud'];
    if (
      audienceExpected &&
      audience != null &&
      audience !== audienceExpected &&
      !String(audience).includes(audienceExpected)
    ) {
      process.stderr.write(
        `[Vincent] JWT audience: got ${String(audience)}, expected ${audienceExpected}\n`,
      );
    }

    if (!pkpAddress) {
      throw new Error(
        'Vincent consent JWT has no PKP wallet address. ' +
          'Make sure you used the connect flow at dashboard.heyvincent.ai — not a login or API token.',
      );
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

export const defaultVincentProvider = new VincentProvider();
