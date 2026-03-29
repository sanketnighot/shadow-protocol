/**
 * SHADOW apps sidecar: one JSON line on stdin → one JSON line on stdout → exit.
 * Isolated process per request (spawned by Rust). No secrets in logs.
 */

import * as readline from "node:readline";

import { defaultFilecoinProvider } from "./providers/filecoin.js";
import { defaultLitProvider } from "./providers/lit.js";
import { defaultFlowProvider } from "./providers/flow.js";

type FilecoinPolicyPayload = {
  ttl: number;
  redundancy: number;
  costLimit: number;
  autoRenew: boolean;
};

type RuntimeRequest = {
  op: string;
  appId: string;
  payload: Record<string, unknown>;
};

type RuntimeResponse = {
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
  data: Record<string, unknown>;
};

function respond(res: RuntimeResponse): void {
  process.stdout.write(`${JSON.stringify(res)}\n`);
}

// Redirect all console logs to stderr so they don't break the JSON IPC stdout boundary
console.log = (...args) => process.stderr.write(args.join(" ") + "\n");
console.error = (...args) => process.stderr.write(args.join(" ") + "\n");
console.warn = (...args) => process.stderr.write(args.join(" ") + "\n");
console.info = (...args) => process.stderr.write(args.join(" ") + "\n");
console.debug = (...args) => process.stderr.write(args.join(" ") + "\n");

function main(): void {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.once("line", async (line) => {
    rl.close();
    let req: RuntimeRequest;
    try {
      req = JSON.parse(line) as RuntimeRequest;
    } catch {
      respond({
        ok: false,
        errorCode: "invalid_json",
        errorMessage: "Malformed request",
        data: {},
      });
      process.exit(0);
      return;
    }

    try {
      const out = await dispatch(req);
      respond(out);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "adapter_error";
      respond({
        ok: false,
        errorCode: "adapter_error",
        errorMessage: msg,
        data: {},
      });
    }
    process.exit(0);
  });
}

async function dispatch(req: RuntimeRequest): Promise<RuntimeResponse> {
  switch (req.op) {
    case "health.ping":
      return {
        ok: true,
        data: { version: "1", ts: Date.now() },
      };
    case "lit.wallet_connect": {
      const data = await defaultLitProvider.connectivityCheck();
      return { ok: true, data };
    }
    case "lit.wallet_status": {
      const g = req.payload as Record<string, unknown>;
      const daily = typeof g.dailySpendLimitUsd === "number" ? g.dailySpendLimitUsd : 500;
      const perTrade = typeof g.perTradeLimitUsd === "number" ? g.perTradeLimitUsd : 100;
      const approvalThreshold = typeof g.approvalThresholdUsd === "number" ? g.approvalThresholdUsd : 1000;
      const allowedProtocols = Array.isArray(g.allowedProtocols)
        ? g.allowedProtocols.filter(x => typeof x === "string")
        : ["uniswap", "aave"];
      const pkpAddress = typeof g.pkpAddress === "string" ? g.pkpAddress : undefined;

      const data = await defaultLitProvider.walletStatus({
        dailySpendLimitUsd: daily,
        perTradeLimitUsd: perTrade,
        approvalThresholdUsd: approvalThreshold,
        allowedProtocols: allowedProtocols as string[]
      }, pkpAddress);
      return { ok: true, data };
    }
    case "lit.precheck": {
      const action = req.payload as { kind?: string; notionalUsd?: number; protocol?: string };
      const g = (req.payload.guardrails ?? {}) as Record<string, unknown>;
      const ethKey = typeof req.payload.ethPrivateKey === "string" ? req.payload.ethPrivateKey : undefined;

      const data = await defaultLitProvider.precheck(action, {
        dailySpendLimitUsd: typeof g.dailySpendLimitUsd === "number" ? g.dailySpendLimitUsd : 500,
        perTradeLimitUsd: typeof g.perTradeLimitUsd === "number" ? g.perTradeLimitUsd : 10000,
        approvalThresholdUsd: typeof g.approvalThresholdUsd === "number" ? g.approvalThresholdUsd : 1000,
        allowedProtocols: Array.isArray(g.allowedProtocols)
          ? (g.allowedProtocols as string[])
          : ["uniswap"]
      }, ethKey);
      return { ok: true, data };
    }
    case "lit.mint_pkp": {
      const ethKey = req.payload.ethPrivateKey;
      if (typeof ethKey !== "string" || ethKey.length < 32) {
        return { ok: false, errorCode: "invalid_key", errorMessage: "Valid ethPrivateKey required", data: {} };
      }
      const data = await defaultLitProvider.mintPkp(ethKey);
      return { ok: true, data };
    }
    case "lit.execute": {
      const ethKey = req.payload.ethPrivateKey;
      const pkpPub = req.payload.pkpPublicKey;
      const toSign = req.payload.toSign;
      if (typeof ethKey !== "string" || typeof pkpPub !== "string" || typeof toSign !== "string") {
        return { ok: false, errorCode: "missing_params", errorMessage: "ethPrivateKey, pkpPublicKey, toSign required", data: {} };
      }
      const data = await defaultLitProvider.executePkpSign(ethKey, pkpPub, toSign);
      return { ok: true, data };
    }
    case "lit.connectivity_check": {
      const data = await defaultLitProvider.connectivityCheck();
      return { ok: true, data };
    }
    case "flow.account_status": {
      const p = req.payload as { apiKey?: string };
      const data = await defaultFlowProvider.accountStatus(p.apiKey);
      return { ok: true, data };
    }
    case "flow.prepare_sponsored": {
      const p = req.payload as { summary?: string; apiKey?: string };
      const data = await defaultFlowProvider.prepareSponsored({ summary: p.summary }, p.apiKey);
      return { ok: true, data };
    }
    case "filecoin.backup_upload": {
      const p = req.payload as {
        ciphertextHex?: string;
        scope?: unknown;
        apiKey?: string;
        policy?: FilecoinPolicyPayload;
      };
      const hex = p.ciphertextHex ?? "";
      const out = await defaultFilecoinProvider.uploadBackup({
        ciphertextHex: hex,
        scope: p.scope ?? {},
        apiKey: p.apiKey,
        policy: p.policy,
      });
      return {
        ok: true,
        data: {
          cid: out.cid,
          bytesReported: out.bytesReported,
          scope: out.scope ?? {},
          transport: out.transport,
          policyApplied: out.policyApplied,
          estimatedCostFil: out.estimatedCostFil,
          storageRatePerMonthUsdfc: out.storageRatePerMonthUsdfc,
          depositNeededUsdfc: out.depositNeededUsdfc,
          uploadReady: out.uploadReady,
          uploadComplete: out.uploadComplete,
          requestedCopies: out.requestedCopies,
          committedCopies: out.committedCopies,
          copiesMeta: out.copiesMeta,
        },
      };
    }
    case "filecoin.restore_fetch": {
      const p = req.payload as { cid?: string; apiKey?: string };
      const prev = await defaultFilecoinProvider.fetchRestorePreview(p.cid ?? "", p.apiKey);
      return {
        ok: true,
        data: {
          ciphertextHex: prev.ciphertextHex,
          note: prev.note,
        },
      };
    }
    case "filecoin.cost_quote": {
      const p = req.payload as { apiKey?: string; dataSize?: number; withCDN?: boolean };
      const apiKey = typeof p.apiKey === "string" ? p.apiKey : "";
      const dataSize = typeof p.dataSize === "number" ? p.dataSize : 1024;
      const q = await defaultFilecoinProvider.quoteUploadCosts({
        apiKey,
        dataSize,
        withCDN: p.withCDN !== false,
      });
      return { ok: true, data: { ...q } };
    }
    case "filecoin.storage_prepare": {
      const p = req.payload as { apiKey?: string; dataSize?: number };
      const apiKey = typeof p.apiKey === "string" ? p.apiKey : "";
      const dataSize = typeof p.dataSize === "number" ? p.dataSize : 1024;
      const prep = await defaultFilecoinProvider.prepareStorage({ apiKey, dataSize });
      return { ok: true, data: { ...prep } };
    }
    case "filecoin.datasets_list": {
      const p = req.payload as { apiKey?: string };
      const apiKey = typeof p.apiKey === "string" ? p.apiKey : "";
      const list = await defaultFilecoinProvider.listDataSets({ apiKey });
      return { ok: true, data: { dataSets: list } };
    }
    case "filecoin.dataset_terminate": {
      const p = req.payload as { apiKey?: string; dataSetId?: string };
      const apiKey = typeof p.apiKey === "string" ? p.apiKey : "";
      const dataSetId = typeof p.dataSetId === "string" ? p.dataSetId : "";
      if (!dataSetId) {
        return {
          ok: false,
          errorCode: "missing_params",
          errorMessage: "dataSetId required",
          data: {},
        };
      }
      const txHash = await defaultFilecoinProvider.terminateDataSet({ apiKey, dataSetId });
      return { ok: true, data: { txHash } };
    }
    default:
      return {
        ok: false,
        errorCode: "unknown_op",
        errorMessage: `Unknown op ${req.op}`,
        data: {},
      };
  }
}

main();
