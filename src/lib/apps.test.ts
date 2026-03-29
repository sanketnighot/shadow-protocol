import { describe, expect, it } from "vitest";

import {
  marketplaceEntryToShadowApp,
  parseFlowConfig,
  parseFilecoinBackupMetadata,
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

describe("parseFilecoinBackupMetadata", () => {
  it("returns empty for invalid json", () => {
    expect(parseFilecoinBackupMetadata("")).toEqual({});
    expect(parseFilecoinBackupMetadata("{")).toEqual({});
  });

  it("parses known fields", () => {
    const m = parseFilecoinBackupMetadata(
      JSON.stringify({
        committedCopies: 2,
        requestedCopies: 2,
        storageRatePerMonthUsdfc: "0.01",
        uploadComplete: true,
      }),
    );
    expect(m.committedCopies).toBe(2);
    expect(m.storageRatePerMonthUsdfc).toBe("0.01");
  });
});

describe("parseFilecoinConfig", () => {
  it("uses defaults for empty config", () => {
    const c = parseFilecoinConfig({});
    expect(c.policy.ttl).toBe(180);
    expect(c.policy.costLimit).toBe(0.01);
    expect(c.backupScope.agentMemory).toBe(true);
  });
  
  it("parses valid config successfully", () => {
    const c2 = parseFilecoinConfig({
      policy: { ttl: 365, costLimit: 0.05, redundancy: 3, autoRenew: false },
      backupScope: { agentMemory: false, configs: false, strategies: true },
    });
    expect(c2.policy.ttl).toBe(365);
    expect(c2.policy.redundancy).toBe(3);
    expect(c2.policy.autoRenew).toBe(false);
    expect(c2.backupScope.agentMemory).toBe(false);
    expect(c2.backupScope.strategies).toBe(true);
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
