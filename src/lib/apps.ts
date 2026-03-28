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

export async function fetchFlowAccountStatusPreview(): Promise<unknown> {
  return invoke<unknown>("apps_flow_account_status", {});
}

export type LitIntegrationConfig = {
  dailySpendLimitUsd: number;
  perTradeLimitUsd: number;
  approvalThresholdUsd: number;
  allowedProtocols: string[];
};

export type FlowIntegrationConfig = {
  network: "mainnet" | "testnet";
  accountHint: string;
};

export type FilecoinBackupScope = {
  agentMemory: boolean;
  threadHistory: boolean;
  appConfigs: boolean;
  strategyMetadata: boolean;
};

export type FilecoinIntegrationConfig = {
  autoBackupIntervalHours: number;
  backupScope: FilecoinBackupScope;
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
  };
}

export function parseFlowConfig(raw: unknown): FlowIntegrationConfig {
  const fallback: FlowIntegrationConfig = {
    network: "testnet",
    accountHint: "",
  };
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  const net = o.network === "mainnet" ? "mainnet" : "testnet";
  const hint =
    typeof o.accountHint === "string" ? o.accountHint.slice(0, 256) : "";
  return { network: net, accountHint: hint };
}

function parseBackupScope(raw: unknown): FilecoinBackupScope {
  const fallback: FilecoinBackupScope = {
    agentMemory: true,
    threadHistory: true,
    appConfigs: true,
    strategyMetadata: true,
  };
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  return {
    agentMemory: typeof o.agentMemory === "boolean" ? o.agentMemory : fallback.agentMemory,
    threadHistory:
      typeof o.threadHistory === "boolean" ? o.threadHistory : fallback.threadHistory,
    appConfigs: typeof o.appConfigs === "boolean" ? o.appConfigs : fallback.appConfigs,
    strategyMetadata:
      typeof o.strategyMetadata === "boolean" ? o.strategyMetadata : fallback.strategyMetadata,
  };
}

export function parseFilecoinConfig(raw: unknown): FilecoinIntegrationConfig {
  const fallback: FilecoinIntegrationConfig = {
    autoBackupIntervalHours: 0,
    backupScope: parseBackupScope({}),
  };
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  const h =
    typeof o.autoBackupIntervalHours === "number" &&
    Number.isFinite(o.autoBackupIntervalHours)
      ? Math.min(168, Math.max(0, Math.floor(o.autoBackupIntervalHours)))
      : 0;
  return {
    autoBackupIntervalHours: h,
    backupScope: parseBackupScope(o.backupScope),
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
};

export async function listAppBackups(): Promise<AppBackupRow[]> {
  return invoke<AppBackupRow[]>("apps_list_backups", {});
}
