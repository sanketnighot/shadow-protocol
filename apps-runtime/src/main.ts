/**
 * SHADOW apps sidecar: one JSON line on stdin → one JSON line on stdout → exit.
 * Isolated process per request (spawned by Rust). No secrets in logs.
 */

import * as readline from "node:readline";

import { defaultFilecoinProvider } from "./providers/filecoin.js";

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

function main(): void {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.once("line", (line) => {
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
      const out = dispatch(req);
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

function dispatch(req: RuntimeRequest): RuntimeResponse {
  switch (req.op) {
    case "health.ping":
      return {
        ok: true,
        data: { version: "1", ts: Date.now() },
      };
    case "lit.wallet_connect": {
      return {
        ok: true,
        data: {
          connected: true,
          address: "0x0000000000000000000000000000000000000002",
          mode: "adapter_stub",
          note: "Wire @lit-protocol/* Vincent/PKP here; payload is intentionally minimal.",
        },
      };
    }
    case "lit.wallet_status": {
      const g = req.payload as Record<string, unknown>;
      const daily =
        typeof g.dailySpendLimitUsd === "number"
          ? g.dailySpendLimitUsd
          : typeof g.dailyLimitUsd === "number"
            ? g.dailyLimitUsd
            : 500;
      const perTrade =
        typeof g.perTradeLimitUsd === "number" ? g.perTradeLimitUsd : 100;
      const approvalThreshold =
        typeof g.approvalThresholdUsd === "number" ? g.approvalThresholdUsd : 1000;
      return {
        ok: true,
        data: {
          mode: "vincent-shaped",
          connected: true,
          address: "0x0000000000000000000000000000000000000001",
          guardrails: {
            dailyLimitUsd: daily,
            perTradeLimitUsd: perTrade,
            approvalThresholdUsd: approvalThreshold,
          },
        },
      };
    }
    case "lit.precheck": {
      const action = req.payload as { kind?: string; notionalUsd?: number };
      const notional = typeof action.notionalUsd === "number" ? action.notionalUsd : 0;
      const limit = 10_000;
      const allowed = notional <= limit;
      return {
        ok: true,
        data: {
          allowed,
          reason: allowed ? "within_shadow_limits" : "exceeds_shadow_limit",
          reviewedNotionalUsd: notional,
          limitUsd: limit,
          actionKind: action.kind ?? "unknown",
        },
      };
    }
    case "flow.account_status":
      return {
        ok: true,
        data: {
          connected: false,
          address: null,
          network: "mainnet-shaped",
        },
      };
    case "flow.prepare_sponsored": {
      const p = req.payload as { summary?: string };
      return {
        ok: true,
        data: {
          status: "prepared",
          summary: p.summary ?? "Flow transaction shell",
          cadencePreview: "// Cadence transaction (preview only)",
          sponsorNote:
            "SHADOW will attach fee payer / proposer via configured Flow access when credentials exist.",
        },
      };
    }
    case "filecoin.backup_upload": {
      const p = req.payload as { ciphertextHex?: string; scope?: unknown };
      const hex = p.ciphertextHex ?? "";
      const out = defaultFilecoinProvider.uploadBackup({
        ciphertextHex: hex,
        scope: p.scope ?? {},
      });
      return {
        ok: true,
        data: {
          cid: out.cid,
          bytesReported: out.bytesReported,
          scope: p.scope ?? {},
          transport: out.transport,
        },
      };
    }
    case "filecoin.restore_fetch": {
      const p = req.payload as { cid?: string };
      const prev = defaultFilecoinProvider.fetchRestorePreview(p.cid ?? "");
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
