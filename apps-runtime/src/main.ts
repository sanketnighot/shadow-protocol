/**
 * SHADOW apps sidecar: one JSON line on stdin → one JSON line on stdout → exit.
 * Isolated process per request (spawned by Rust). No secrets in logs.
 */

import * as readline from "node:readline";

import { defaultFilecoinProvider } from "./providers/filecoin.js";
import { defaultLitProvider } from "./providers/lit.js";
import { defaultFlowProvider } from "./providers/flow.js";

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
      const data = await defaultLitProvider.walletConnect();
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

      const data = await defaultLitProvider.walletStatus({
        dailySpendLimitUsd: daily,
        perTradeLimitUsd: perTrade,
        approvalThresholdUsd: approvalThreshold,
        allowedProtocols: allowedProtocols as string[]
      });
      return { ok: true, data };
    }
    case "lit.precheck": {
      const action = req.payload as { kind?: string; notionalUsd?: number };
      const g = req.payload.guardrails as Record<string, unknown> ?? {};
      const limit = typeof g.perTradeLimitUsd === "number" ? g.perTradeLimitUsd : 10000;

      const data = await defaultLitProvider.precheck(action, {
        dailySpendLimitUsd: typeof g.dailySpendLimitUsd === "number" ? g.dailySpendLimitUsd : 500,
        perTradeLimitUsd: limit,
        approvalThresholdUsd: typeof g.approvalThresholdUsd === "number" ? g.approvalThresholdUsd : 1000,
        allowedProtocols: ["uniswap"]
      });
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
      const p = req.payload as { ciphertextHex?: string; scope?: unknown; apiKey?: string };
      const hex = p.ciphertextHex ?? "";
      const out = await defaultFilecoinProvider.uploadBackup({
        ciphertextHex: hex,
        scope: p.scope ?? {},
        apiKey: p.apiKey,
      });
      return {
        ok: true,
        data: {
          cid: out.cid,
          bytesReported: out.bytesReported,
          scope: out.scope ?? {},
          transport: out.transport,
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
