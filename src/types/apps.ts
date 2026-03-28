/** Mirrors Rust `AppMarketplaceEntry` / catalog rows (camelCase from serde). */

export type AppCatalogIpc = {
  id: string;
  name: string;
  shortDescription: string;
  longDescription: string;
  iconKey: string;
  version: string;
  author: string;
  featuresJson: string;
  permissionsJson: string;
  secretRequirementsJson: string;
  agentToolsJson: string;
  networkScopesJson: string;
  updatedAt: number;
};

export type InstalledAppIpc = {
  appId: string;
  lifecycle: string;
  installedVersion: string;
  enabled: boolean;
  healthStatus: string;
  healthMessage: string | null;
  lastHealthAt: number | null;
  permissionsAcknowledgedAt: number | null;
  errorMessage: string | null;
  installedAt: number;
  updatedAt: number;
};

export type AppMarketplaceEntryIpc = {
  catalog: AppCatalogIpc;
  installed: InstalledAppIpc | null;
};

export type AppsMarketplaceResponse = {
  entries: AppMarketplaceEntryIpc[];
};

export type AppStatus = "active" | "inactive" | "error" | "updating" | "paused";

/** UI-facing row (no fake marketplace metrics). */
export type ShadowApp = {
  id: string;
  name: string;
  shortDescription: string;
  longDescription: string;
  icon: string;
  version: string;
  author: string;
  status: AppStatus;
  isInstalled: boolean;
  features: string[];
  permissions: string[];
  secretRequirements: string[];
  healthStatus?: string;
  lifecycle?: string;
};
