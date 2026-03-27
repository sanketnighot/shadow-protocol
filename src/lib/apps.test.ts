import { describe, expect, it } from "vitest";

import {
  marketplaceEntryToShadowApp,
  parseFlowConfig,
  parseFilecoinConfig,
  parseLitConfig,
} from "@/lib/apps";
import type { AppMarketplaceEntryIpc } from "@/types/apps";

function catalog(
  overrides: Partial<AppMarketplaceEntryIpc["catalog"]> = {},
): AppMarketplaceEntryIpc["catalog"] {
  return {
    id: "lit-protocol",
    name: "Lit",
    shortDescription: "s",
    longDescription: "l",
    iconKey: "Zap",
    version: "1",
    author: "a",
    featuresJson: "[]",
    permissionsJson: "[]",
    secretRequirementsJson: "[]",
    agentToolsJson: "[]",
    networkScopesJson: "[]",
    updatedAt: 0,
    ...overrides,
  };
}

describe("parseLitConfig", () => {
  it("uses defaults for empty input", () => {
    const c = parseLitConfig({});
    expect(c.dailySpendLimitUsd).toBe(500);
    expect(c.perTradeLimitUsd).toBe(100);
    expect(c.approvalThresholdUsd).toBe(1000);
    expect(c.allowedProtocols).toEqual(["uniswap", "aave"]);
  });

  it("clamps daily limit", () => {
    expect(parseLitConfig({ dailySpendLimitUsd: 99999 }).dailySpendLimitUsd).toBe(5000);
    expect(parseLitConfig({ dailySpendLimitUsd: -5 }).dailySpendLimitUsd).toBe(0);
  });
});

describe("parseFlowConfig", () => {
  it("normalizes network", () => {
    expect(parseFlowConfig({ network: "mainnet" }).network).toBe("mainnet");
    expect(parseFlowConfig({}).network).toBe("testnet");
  });
});

describe("parseFilecoinConfig", () => {
  it("clamps hours and parses backup scope", () => {
    const c = parseFilecoinConfig({ autoBackupIntervalHours: 999 });
    expect(c.autoBackupIntervalHours).toBe(168);
    expect(c.backupScope.agentMemory).toBe(true);
    const c2 = parseFilecoinConfig({
      autoBackupIntervalHours: 1,
      backupScope: { agentMemory: false, threadHistory: true, appConfigs: false, strategyMetadata: false },
    });
    expect(c2.backupScope.agentMemory).toBe(false);
    expect(c2.backupScope.threadHistory).toBe(true);
  });
});

describe("marketplaceEntryToShadowApp", () => {
  it("maps installed active app", () => {
    const e: AppMarketplaceEntryIpc = {
      catalog: catalog(),
      installed: {
        appId: "lit-protocol",
        lifecycle: "active",
        installedVersion: "1",
        enabled: true,
        healthStatus: "ok",
        healthMessage: null,
        lastHealthAt: null,
        permissionsAcknowledgedAt: 1,
        errorMessage: null,
        installedAt: 0,
        updatedAt: 0,
      },
    };
    const s = marketplaceEntryToShadowApp(e);
    expect(s.status).toBe("active");
    expect(s.isInstalled).toBe(true);
  });

  it("maps error lifecycle", () => {
    const e: AppMarketplaceEntryIpc = {
      catalog: catalog(),
      installed: {
        appId: "lit-protocol",
        lifecycle: "error",
        installedVersion: "1",
        enabled: false,
        healthStatus: "error",
        healthMessage: "x",
        lastHealthAt: null,
        permissionsAcknowledgedAt: null,
        errorMessage: "e",
        installedAt: 0,
        updatedAt: 0,
      },
    };
    expect(marketplaceEntryToShadowApp(e).status).toBe("error");
  });
});
