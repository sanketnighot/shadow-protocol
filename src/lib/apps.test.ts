import { describe, expect, it } from "vitest";

import {
  buildFlowScheduleIntent,
  getDefaultFlowScheduleDraft,
  marketplaceEntryToShadowApp,
  parseFlowConfig,
  parseFilecoinBackupMetadata,
  parseFilecoinConfig,
  parseFlowScheduledMetadata,
  parseLitConfig,
  validateFlowScheduleDraft,
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

  it("preserves Vincent consent configuration", () => {
    const c = parseLitConfig({
      vincentAppId: "shadow-vincent-app",
      pkpEthAddress: "0x1111111111111111111111111111111111111111",
    });
    expect(c.vincentAppId).toBe("shadow-vincent-app");
    expect(c.pkpEthAddress).toBe("0x1111111111111111111111111111111111111111");
  });
});

describe("parseFlowConfig", () => {
  it("normalizes network", () => {
    expect(parseFlowConfig({ network: "mainnet" }).network).toBe("mainnet");
    expect(parseFlowConfig({}).network).toBe("testnet");
  });

  it("migrates legacy accountHint evm to linkedEvmAddress", () => {
    const evm = "0x1111111111111111111111111111111111111111";
    const c = parseFlowConfig({ accountHint: evm });
    expect(c.linkedEvmAddress).toBe(evm);
    expect(c.cadenceAddress).toBe("");
  });

  it("migrates legacy accountHint cadence to cadenceAddress", () => {
    const cad = "0xabcdef0123456789";
    const c = parseFlowConfig({ accountHint: cad });
    expect(c.cadenceAddress).toBe(cad);
    expect(c.linkedEvmAddress).toBe("");
  });

  it("prefers explicit cadenceAddress over accountHint", () => {
    const c = parseFlowConfig({
      cadenceAddress: "aaaaaaaaaaaaaaaa",
      accountHint: "0x1111111111111111111111111111111111111111",
    });
    expect(c.cadenceAddress).toBe("aaaaaaaaaaaaaaaa");
    expect(c.linkedEvmAddress).toBe("0x1111111111111111111111111111111111111111");
  });
});

describe("flow schedule helpers", () => {
  it("rejects missing cron summary and dca amount", () => {
    const draft = getDefaultFlowScheduleDraft();
    const result = validateFlowScheduleDraft(draft);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "Add a short summary so this schedule is easy to recognize.",
    );
    expect(result.errors).toContain(
      "Enter a positive amount for the DCA order.",
    );
  });

  it("builds a cron dca intent", () => {
    const draft = {
      ...getDefaultFlowScheduleDraft(),
      summary: "Weekly FLOW accumulation",
      toSymbol: "FUSD",
      amount: "25",
    };
    const intent = buildFlowScheduleIntent(draft);
    expect(intent.handlerType).toBe("dca");
    expect(intent.schedule).toEqual({
      type: "cron",
      cronExpression: "0 0 * * 1",
    });
    expect(intent.params).toEqual({
      fromSymbol: "FLOW",
      toSymbol: "FUSD",
      amount: "25",
    });
  });

  it("builds a one-time custom intent", () => {
    const draft = {
      ...getDefaultFlowScheduleDraft(),
      scheduleMode: "one_time" as const,
      handlerType: "custom" as const,
      summary: "One-time custom workflow",
      oneShotTimestamp: 1_800_000_000,
      customJson: JSON.stringify({ operation: "claim_rewards" }),
    };
    const intent = buildFlowScheduleIntent(draft);
    expect(intent.schedule).toEqual({
      type: "one_time",
      oneShotTimestamp: 1_800_000_000,
    });
    expect(intent.params).toEqual({
      custom: { operation: "claim_rewards" },
    });
  });

  it("parses stored flow scheduled metadata", () => {
    const meta = parseFlowScheduledMetadata(
      JSON.stringify({
        kind: "shadow_manual_schedule",
        summary: "Weekly rebalance",
        schedule: { type: "cron", cronExpression: "0 12 * * 1" },
      }),
    );
    expect(meta.summary).toBe("Weekly rebalance");
    expect(meta.schedule?.cronExpression).toBe("0 12 * * 1");
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
    expect(c.policy.costLimit).toBe(3);
    expect(c.backupScope.agentMemory).toBe(true);
    expect(c.backupScope.transactionHistory).toBe(false);
    expect(c.backupScope.portfolioSnapshots).toBe(false);
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
