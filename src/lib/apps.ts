import { invoke } from "@tauri-apps/api/core";

import type {
  AppsMarketplaceResponse,
  AppMarketplaceEntryIpc,
  ShadowApp,
} from "@/types/apps";

/** IPC mirror of Rust `RuntimeResponse` (apps_runtime_health). */
export type AppsRuntimeHealthIpc = {
  ok: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  data: unknown;
};

export async function fetchAppsRuntimeHealth(): Promise<AppsRuntimeHealthIpc> {
  return invoke<AppsRuntimeHealthIpc>("apps_runtime_health", {});
}

export async function fetchAppsRefreshHealth(): Promise<ShadowApp[]> {
  const res = await invoke<AppsMarketplaceResponse>("apps_refresh_health", {});
  return res.entries.map(marketplaceEntryToShadowApp);
}

export async function fetchLitWalletStatusPreview(): Promise<unknown> {
  return invoke<unknown>("apps_lit_wallet_status", {});
}

export type LitPkpAddressResult = {
  pkpAddress: string | null;
  hasPkp: boolean;
};

export async function getLitPkpAddress(): Promise<LitPkpAddressResult> {
  return invoke<LitPkpAddressResult>("apps_lit_pkp_address", {});
}

export async function mintLitPkp(): Promise<unknown> {
  return invoke<unknown>("apps_lit_mint_pkp", {});
}

// ---------------------------------------------------------------------------
// Vincent SDK helpers
// ---------------------------------------------------------------------------

export type VincentConsentStatus = {
  hasConsent: boolean;
  pkpAddress: string | null;
  pkpPublicKey: string | null;
  grantedAbilities: string[];
  expiresAt: number | null;
  expired: boolean;
};

export type VincentConsentGrant = {
  pkpAddress: string;
  pkpPublicKey: string;
  grantedAbilities: string[];
  expiresAt: number;
};

export type VincentConsentUrlResult = {
  url: string;
};

export async function getVincentConsentUrl(): Promise<VincentConsentUrlResult> {
  return invoke<VincentConsentUrlResult>("apps_vincent_consent_url", {});
}

export async function submitVincentJwt(jwt: string): Promise<VincentConsentGrant> {
  return invoke<VincentConsentGrant>("apps_vincent_submit_jwt", { input: { jwt } });
}

export async function getVincentConsentStatus(): Promise<VincentConsentStatus> {
  return invoke<VincentConsentStatus>("apps_vincent_consent_status", {});
}

export async function revokeVincentConsent(): Promise<void> {
  return invoke("apps_vincent_revoke_consent", {});
}

export async function setVincentDelegateeKey(key: string): Promise<void> {
  return invoke("apps_vincent_set_delegatee_key", { input: { key } });
}

export async function executeVincentApproved(
  operation: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  return invoke<unknown>("apps_vincent_execute_approved", {
    input: { operation, params },
  });
}

export async function fetchFlowAccountStatusPreview(): Promise<unknown> {
  return invoke<unknown>("apps_flow_account_status", {});
}

/** Mirrors `FlowScheduledTransactionRow` (camelCase) from Rust. */
export type FlowScheduledRowIpc = {
  id: string;
  strategyId?: string | null;
  flowSchedulerNumericId?: number | null;
  handlerType: string;
  cronExpression?: string | null;
  status: string;
  priority: string;
  feePaid: string;
  submittedTxId: string;
  scheduledAt: number;
  executedAt?: number | null;
  metadataJson: string;
  createdAt: number;
};

export async function appsFlowListScheduled(
  limit?: number,
): Promise<FlowScheduledRowIpc[]> {
  return invoke<FlowScheduledRowIpc[]>("apps_flow_list_scheduled", {
    limit: limit ?? null,
  });
}

export async function appsFlowEstimateScheduleFee(params: {
  executionEffort?: number;
  priorityRaw?: number;
  dataSizeMB?: string;
}): Promise<unknown> {
  return invoke("apps_flow_estimate_schedule_fee", {
    executionEffort: params.executionEffort ?? null,
    priorityRaw: params.priorityRaw ?? null,
    dataSizeMB: params.dataSizeMB ?? null,
  });
}

export async function appsFlowSyncScheduled(): Promise<void> {
  await invoke("apps_flow_sync_scheduled", {});
}

export async function appsFlowCancelScheduledRecord(
  recordId: string,
): Promise<unknown> {
  return invoke("apps_flow_cancel_scheduled_record", { recordId });
}

export type FlowScheduleMode = "cron" | "one_time";

export type FlowScheduleHandlerType = "dca" | "rebalance" | "alert" | "custom";

export type FlowScheduleDraft = {
  scheduleMode: FlowScheduleMode;
  handlerType: FlowScheduleHandlerType;
  summary: string;
  cronExpression: string;
  oneShotTimestamp?: number | null;
  fromSymbol: string;
  toSymbol: string;
  amount: string;
  targetAllocationsText: string;
  customJson: string;
};

export type FlowManualScheduleIntent = {
  kind: "shadow_manual_schedule";
  version: 1;
  handlerType: FlowScheduleHandlerType;
  summary: string;
  schedule:
    | { type: "cron"; cronExpression: string }
    | { type: "one_time"; oneShotTimestamp: number };
  params: Record<string, unknown>;
};

export type FlowScheduleValidationResult = {
  ok: boolean;
  errors: string[];
};

export type FlowScheduledIntentMetadata = {
  kind?: string;
  version?: number;
  handlerType?: string;
  summary?: string;
  schedule?: {
    type?: string;
    cronExpression?: string;
    oneShotTimestamp?: number;
  };
  params?: Record<string, unknown>;
};

export function getDefaultFlowScheduleDraft(): FlowScheduleDraft {
  return {
    scheduleMode: "cron",
    handlerType: "dca",
    summary: "",
    cronExpression: "0 0 * * 1",
    oneShotTimestamp: null,
    fromSymbol: "FLOW",
    toSymbol: "",
    amount: "",
    targetAllocationsText: "",
    customJson: "",
  };
}

function isFinitePositiveNumberText(value: string): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

export function validateFlowScheduleDraft(
  draft: FlowScheduleDraft,
): FlowScheduleValidationResult {
  const errors: string[] = [];
  const summary = draft.summary.trim();
  const cronExpression = draft.cronExpression.trim();

  if (summary.length < 3) {
    errors.push("Add a short summary so this schedule is easy to recognize.");
  }
  if (summary.length > 140) {
    errors.push("Summary must be 140 characters or less.");
  }

  if (draft.scheduleMode === "cron") {
    if (cronExpression.length < 5) {
      errors.push("Enter a cron expression for recurring schedules.");
    }
  } else if (
    !Number.isInteger(draft.oneShotTimestamp) ||
    (draft.oneShotTimestamp ?? 0) <= 0
  ) {
    errors.push("Choose a valid one-time execution timestamp.");
  }

  switch (draft.handlerType) {
    case "dca":
      if (draft.fromSymbol.trim().length === 0) {
        errors.push("Select the asset you want to spend.");
      }
      if (draft.toSymbol.trim().length === 0) {
        errors.push("Select the asset you want to buy.");
      }
      if (!isFinitePositiveNumberText(draft.amount.trim())) {
        errors.push("Enter a positive amount for the DCA order.");
      }
      break;
    case "rebalance":
      if (draft.targetAllocationsText.trim().length < 3) {
        errors.push("Add target allocations for the rebalance schedule.");
      }
      break;
    case "custom":
      if (draft.customJson.trim().length === 0) {
        errors.push("Add a JSON payload for the custom schedule.");
      } else {
        try {
          const parsed = JSON.parse(draft.customJson) as unknown;
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            errors.push("Custom schedule JSON must be an object.");
          }
        } catch {
          errors.push("Custom schedule JSON is invalid.");
        }
      }
      break;
    case "alert":
      break;
  }

  return { ok: errors.length === 0, errors };
}

export function buildFlowScheduleIntent(
  draft: FlowScheduleDraft,
): FlowManualScheduleIntent {
  const validation = validateFlowScheduleDraft(draft);
  if (!validation.ok) {
    throw new Error(validation.errors[0] ?? "Invalid Flow schedule.");
  }

  const schedule =
    draft.scheduleMode === "cron"
      ? {
          type: "cron" as const,
          cronExpression: draft.cronExpression.trim(),
        }
      : {
          type: "one_time" as const,
          oneShotTimestamp: draft.oneShotTimestamp as number,
        };

  const params: Record<string, unknown> = {};
  if (draft.handlerType === "dca") {
    params.fromSymbol = draft.fromSymbol.trim().toUpperCase();
    params.toSymbol = draft.toSymbol.trim().toUpperCase();
    params.amount = draft.amount.trim();
  } else if (draft.handlerType === "rebalance") {
    params.targetAllocationsText = draft.targetAllocationsText.trim();
  } else if (draft.handlerType === "custom") {
    params.custom = JSON.parse(draft.customJson) as Record<string, unknown>;
  }

  return {
    kind: "shadow_manual_schedule",
    version: 1,
    handlerType: draft.handlerType,
    summary: draft.summary.trim(),
    schedule,
    params,
  };
}

export function parseFlowScheduledMetadata(
  raw: string | null | undefined,
): FlowScheduledIntentMetadata {
  if (!raw || raw.trim() === "") {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as FlowScheduledIntentMetadata;
  } catch {
    return {};
  }
}

export async function appsFlowCreateSchedule(input: {
  handlerType: FlowScheduleHandlerType;
  cronExpression?: string | null;
  intentJson: FlowManualScheduleIntent;
}): Promise<{ txId?: string; note?: string }> {
  return invoke<{ txId?: string; note?: string }>("apps_flow_create_schedule", {
    input: {
      handlerType: input.handlerType,
      cronExpression: input.cronExpression ?? null,
      intentJson: input.intentJson,
    },
  });
}

export type LitIntegrationConfig = {
  dailySpendLimitUsd: number;
  perTradeLimitUsd: number;
  approvalThresholdUsd: number;
  allowedProtocols: string[];
  pkpEthAddress?: string;
  pkpPublicKey?: string;
  pkpTokenId?: string;
};

export type FlowIntegrationConfig = {
  network: "mainnet" | "testnet";
  /** Flow EVM wallet in SHADOW this Flow setup is associated with (`0x` + 40 hex). */
  linkedEvmAddress: string;
  /** Cadence-native Flow account: 16 hex characters (optional `0x`). Used for Cadence portfolio + tools. */
  cadenceAddress: string;
  /** @deprecated Use `cadenceAddress` / `linkedEvmAddress`; kept for parse/save compatibility. */
  accountHint: string;
};

export type FilecoinIntegrationConfig = {
  backupScope: {
    agentMemory: boolean;
    configs: boolean;
    strategies: boolean;
    transactionHistory: boolean;
    portfolioSnapshots: boolean;
  };
  policy: {
    ttl: number;
    redundancy: number;
    costLimit: number;
    autoRenew: boolean;
  };
};

const PROTOCOL_OPTIONS = [
  { id: "uniswap", label: "Uniswap" },
  { id: "aave", label: "Aave" },
  { id: "compound", label: "Compound" },
  { id: "curve", label: "Curve" },
] as const;

export function protocolOptions(): (typeof PROTOCOL_OPTIONS)[number][] {
  return [...PROTOCOL_OPTIONS];
}

export function parseLitConfig(raw: unknown): LitIntegrationConfig {
  const fallback: LitIntegrationConfig = {
    dailySpendLimitUsd: 500,
    perTradeLimitUsd: 100,
    approvalThresholdUsd: 1000,
    allowedProtocols: ["uniswap", "aave"],
  };
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  const daily =
    typeof o.dailySpendLimitUsd === "number" && Number.isFinite(o.dailySpendLimitUsd)
      ? Math.min(5000, Math.max(0, o.dailySpendLimitUsd))
      : fallback.dailySpendLimitUsd;
  const perTrade =
    typeof o.perTradeLimitUsd === "number" && Number.isFinite(o.perTradeLimitUsd)
      ? Math.min(5000, Math.max(0, o.perTradeLimitUsd))
      : fallback.perTradeLimitUsd;
  const approval =
    typeof o.approvalThresholdUsd === "number" && Number.isFinite(o.approvalThresholdUsd)
      ? Math.min(1_000_000, Math.max(0, o.approvalThresholdUsd))
      : fallback.approvalThresholdUsd;
  const protocols = Array.isArray(o.allowedProtocols)
    ? o.allowedProtocols.filter((x): x is string => typeof x === "string")
    : fallback.allowedProtocols;
  return {
    dailySpendLimitUsd: daily,
    perTradeLimitUsd: perTrade,
    approvalThresholdUsd: approval,
    allowedProtocols: protocols,
    pkpEthAddress: typeof o.pkpEthAddress === "string" ? o.pkpEthAddress : undefined,
    pkpPublicKey: typeof o.pkpPublicKey === "string" ? o.pkpPublicKey : undefined,
    pkpTokenId: typeof o.pkpTokenId === "string" ? o.pkpTokenId : undefined,
  };
}

function isEvmAddressHint(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(s.trim());
}

function isCadenceAddressHint(s: string): boolean {
  const t = s.trim();
  const body = t.startsWith("0x") ? t.slice(2) : t;
  return body.length === 16 && /^[a-fA-F0-9]+$/.test(body);
}

export function parseFlowConfig(raw: unknown): FlowIntegrationConfig {
  const fallback: FlowIntegrationConfig = {
    network: "testnet",
    linkedEvmAddress: "",
    cadenceAddress: "",
    accountHint: "",
  };
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  const net = o.network === "mainnet" ? "mainnet" : "testnet";
  let linkedEvmAddress =
    typeof o.linkedEvmAddress === "string" ? o.linkedEvmAddress.trim().slice(0, 42) : "";
  let cadenceAddress =
    typeof o.cadenceAddress === "string" ? o.cadenceAddress.trim().slice(0, 66) : "";
  const hint = typeof o.accountHint === "string" ? o.accountHint.trim().slice(0, 256) : "";

  if (!linkedEvmAddress && hint && isEvmAddressHint(hint)) {
    linkedEvmAddress = hint.slice(0, 42);
  }
  if (!cadenceAddress && hint && isCadenceAddressHint(hint)) {
    cadenceAddress = hint.slice(0, 66);
  }

  return {
    network: net,
    linkedEvmAddress,
    cadenceAddress,
    accountHint: hint,
  };
}

export type FilecoinBackupMetadata = {
  uploadComplete?: boolean;
  requestedCopies?: number;
  committedCopies?: number;
  storageRatePerMonthUsdfc?: string;
  depositNeededUsdfc?: string;
  uploadReady?: boolean;
};

export function parseFilecoinBackupMetadata(raw: string | null | undefined): FilecoinBackupMetadata {
  if (!raw || typeof raw !== "string" || raw.trim() === "") {
    return {};
  }
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return {};
    return v as FilecoinBackupMetadata;
  } catch {
    return {};
  }
}

export function parseFilecoinConfig(raw: unknown): FilecoinIntegrationConfig {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const scope = (typeof o.backupScope === "object" && o.backupScope !== null ? o.backupScope : {}) as Record<string, unknown>;
  const policy = (typeof o.policy === "object" && o.policy !== null ? o.policy : {}) as Record<string, unknown>;
  
  return {
    backupScope: {
      agentMemory: typeof scope.agentMemory === "boolean" ? scope.agentMemory : true,
      configs: typeof scope.configs === "boolean" ? scope.configs : true,
      strategies: typeof scope.strategies === "boolean" ? scope.strategies : true,
      transactionHistory:
        typeof scope.transactionHistory === "boolean" ? scope.transactionHistory : false,
      portfolioSnapshots:
        typeof scope.portfolioSnapshots === "boolean" ? scope.portfolioSnapshots : false,
    },
    policy: {
      ttl: typeof policy.ttl === "number" ? policy.ttl : 180,
      redundancy: typeof policy.redundancy === "number" ? policy.redundancy : 2,
      costLimit: (() => {
        const raw =
          typeof policy.costLimit === "number" && Number.isFinite(policy.costLimit)
            ? policy.costLimit
            : 3;
        return Math.min(25, Math.max(0.01, raw));
      })(),
      autoRenew: typeof policy.autoRenew === "boolean" ? policy.autoRenew : true,
    },
  };
}

function parseJsonArray(raw: string, fallback: string[]): string[] {
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return fallback;
    return v.filter((x): x is string => typeof x === "string");
  } catch {
    return fallback;
  }
}

export function marketplaceEntryToShadowApp(e: AppMarketplaceEntryIpc): ShadowApp {
  const c = e.catalog;
  const features = parseJsonArray(c.featuresJson, []);
  const permissions = parseJsonArray(c.permissionsJson, []);
  const secretRequirements = parseJsonArray(c.secretRequirementsJson, []);
  const installed = e.installed;
  const isInstalled = installed !== null;

  let status: ShadowApp["status"] = "inactive";
  if (installed) {
    if (installed.lifecycle === "error" || installed.healthStatus === "error") {
      status = "error";
    } else if (installed.lifecycle === "installing" || installed.lifecycle === "updating") {
      status = "updating";
    } else if (installed.lifecycle === "paused") {
      status = "paused";
    } else if (installed.enabled && installed.lifecycle === "active") {
      status = "active";
    } else {
      status = "inactive";
    }
  }

  return {
    id: c.id,
    name: c.name,
    shortDescription: c.shortDescription,
    longDescription: c.longDescription,
    icon: c.iconKey,
    version: c.version,
    author: c.author,
    status,
    isInstalled,
    features,
    permissions,
    secretRequirements,
    healthStatus: installed?.healthStatus,
    lifecycle: installed?.lifecycle,
  };
}

export async function fetchAppsMarketplace(): Promise<ShadowApp[]> {
  const res = await invoke<AppsMarketplaceResponse>("apps_marketplace_list", {});
  return res.entries.map(marketplaceEntryToShadowApp);
}

export async function installApp(
  appId: string,
  acknowledgePermissions: boolean,
): Promise<ShadowApp[]> {
  await invoke<AppsMarketplaceResponse>("apps_install", {
    input: { appId, acknowledgePermissions },
  });
  return fetchAppsMarketplace();
}

export async function uninstallApp(appId: string): Promise<ShadowApp[]> {
  await invoke<AppsMarketplaceResponse>("apps_uninstall", {
    input: { appId },
  });
  return fetchAppsMarketplace();
}

export async function setAppEnabled(
  appId: string,
  enabled: boolean,
): Promise<ShadowApp[]> {
  await invoke<AppsMarketplaceResponse>("apps_set_enabled", {
    input: { appId, enabled },
  });
  return fetchAppsMarketplace();
}

export async function getAppConfig(appId: string): Promise<unknown> {
  return invoke<unknown>("apps_get_config", { input: { appId } });
}

export async function setAppConfig(
  appId: string,
  config: unknown,
): Promise<void> {
  await invoke("apps_set_config", { input: { appId, config } });
}

export async function setAppSecret(
  appId: string,
  key: string,
  value: string,
): Promise<void> {
  await invoke("apps_set_secret", {
    input: { appId, key, value },
  });
}

export async function removeAppSecret(
  appId: string,
  key: string,
): Promise<void> {
  await invoke("apps_remove_secret", {
    input: { appId, key },
  });
}

export type AppBackupRow = {
  id: string;
  appId: string;
  cid: string;
  encryptionVersion: number;
  createdAt: number;
  scopeJson: string;
  status: string;
  sizeBytes: number | null;
  notes: string | null;
  /** JSON string: uploadComplete, copiesMeta, storageRatePerMonthUsdfc, etc. */
  metadataJson?: string;
};

export async function listAppBackups(): Promise<AppBackupRow[]> {
  return invoke<AppBackupRow[]>("apps_list_backups", {});
}

export type FilecoinCostQuote = {
  ratePerMonthUsdfc: string;
  depositNeededUsdfc: string;
  ready: boolean;
  needsFwssMaxApproval: boolean;
};

export type FilecoinDataSetRow = {
  pdpVerifierDataSetId?: string;
  activePieceCount?: string;
  isLive?: boolean;
  withCDN?: boolean;
  metadata?: unknown;
};

export async function fetchFilecoinCostQuote(dataSize: number): Promise<FilecoinCostQuote> {
  return invoke<FilecoinCostQuote>("apps_filecoin_quote_cost", {
    input: { dataSize },
  });
}

export async function fetchFilecoinDatasets(): Promise<{ dataSets: FilecoinDataSetRow[] }> {
  return invoke<{ dataSets: FilecoinDataSetRow[] }>("apps_filecoin_list_datasets", {});
}

export async function restoreFilecoinByCid(cid: string): Promise<boolean> {
  return invoke<boolean>("apps_filecoin_restore_by_cid", {
    input: { cid },
  });
}

export async function backupFilecoinNow(): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>("apps_filecoin_backup_now", {});
}
