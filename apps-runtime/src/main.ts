/**
 * SHADOW apps sidecar: one JSON line on stdin → one JSON line on stdout → exit.
 * Isolated process per request (spawned by Rust). No secrets in logs.
 */

import * as readline from "node:readline";

// Lazy-loaded providers to avoid loading heavy SDKs unnecessarily
let _defaultFilecoinProvider: import("./providers/filecoin.js").FilecoinStorageProvider | null = null;
let _defaultLitProvider: import("./providers/lit.js").LitProvider | null = null;
let _defaultFlowProvider: import("./providers/flow.js").FlowProvider | null = null;
let _defaultVincentProvider: import("./providers/vincent.js").VincentProvider | null = null;

async function getFilecoinProvider() {
  if (!_defaultFilecoinProvider) {
    const m = await import("./providers/filecoin.js");
    _defaultFilecoinProvider = m.defaultFilecoinProvider;
  }
  return _defaultFilecoinProvider;
}

async function getLitProvider() {
  if (!_defaultLitProvider) {
    const m = await import("./providers/lit.js");
    _defaultLitProvider = m.defaultLitProvider;
  }
  return _defaultLitProvider;
}

async function getFlowProvider() {
  if (!_defaultFlowProvider) {
    const m = await import("./providers/flow.js");
    _defaultFlowProvider = m.defaultFlowProvider;
  }
  return _defaultFlowProvider;
}

async function getVincentProvider() {
  if (!_defaultVincentProvider) {
    const m = await import("./providers/vincent.js");
    _defaultVincentProvider = m.defaultVincentProvider;
  }
  return _defaultVincentProvider;
}

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
      const lit = await getLitProvider();
      const data = await lit.connectivityCheck();
      return { ok: true, data };
    }
    case "lit.wallet_status": {
      const lit = await getLitProvider();
      const g = req.payload as Record<string, unknown>;
      const daily = typeof g.dailySpendLimitUsd === "number" ? g.dailySpendLimitUsd : 500;
      const perTrade = typeof g.perTradeLimitUsd === "number" ? g.perTradeLimitUsd : 100;
      const approvalThreshold = typeof g.approvalThresholdUsd === "number" ? g.approvalThresholdUsd : 1000;
      const allowedProtocols = Array.isArray(g.allowedProtocols)
        ? g.allowedProtocols.filter(x => typeof x === "string")
        : ["uniswap", "aave"];
      const pkpAddress = typeof g.pkpAddress === "string" ? g.pkpAddress : undefined;

      const data = await lit.walletStatus({
        dailySpendLimitUsd: daily,
        perTradeLimitUsd: perTrade,
        approvalThresholdUsd: approvalThreshold,
        allowedProtocols: allowedProtocols as string[]
      }, pkpAddress);
      return { ok: true, data };
    }
    case "lit.precheck": {
      const lit = await getLitProvider();
      const action = req.payload as { kind?: string; notionalUsd?: number; protocol?: string };
      const g = (req.payload.guardrails ?? {}) as Record<string, unknown>;
      const ethKey = typeof req.payload.ethPrivateKey === "string" ? req.payload.ethPrivateKey : undefined;

      const data = await lit.precheck(action, {
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
      const lit = await getLitProvider();
      const ethKey = req.payload.ethPrivateKey;
      if (typeof ethKey !== "string" || ethKey.length < 32) {
        return { ok: false, errorCode: "invalid_key", errorMessage: "Valid ethPrivateKey required", data: {} };
      }
      const data = await lit.mintPkp(ethKey);
      return { ok: true, data };
    }
    case "lit.execute": {
      const lit = await getLitProvider();
      const ethKey = req.payload.ethPrivateKey;
      const pkpPub = req.payload.pkpPublicKey;
      const toSign = req.payload.toSign;
      if (typeof ethKey !== "string" || typeof pkpPub !== "string" || typeof toSign !== "string") {
        return { ok: false, errorCode: "missing_params", errorMessage: "ethPrivateKey, pkpPublicKey, toSign required", data: {} };
      }
      const data = await lit.executePkpSign(ethKey, pkpPub, toSign);
      return { ok: true, data };
    }
    case "lit.connectivity_check": {
      const lit = await getLitProvider();
      const data = await lit.connectivityCheck();
      return { ok: true, data };
    }
    case "flow.account_status": {
      const flow = await getFlowProvider();
      const p = req.payload as { network?: string };
      const net = p.network === "mainnet" || p.network === "testnet" ? p.network : "testnet";
      flow.setNetwork(net);
      const data = await flow.accountStatus();
      return { ok: true, data };
    }
    case "flow.fetch_balances": {
      const flow = await getFlowProvider();
      const p = req.payload as { address?: string; network?: string };
      if (!p.address) {
        return { ok: false, errorCode: "missing_params", errorMessage: "address required", data: {} };
      }
      try {
        const net = p.network === "mainnet" || p.network === "testnet" ? p.network : undefined;
        const balances = await flow.fetchBalances(p.address, net);
        return { ok: true, data: { assets: balances } };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        return { ok: false, errorCode: "flow_error", errorMessage: msg, data: {} };
      }
    }
    case "flow.prepare_sponsored": {
      const flow = await getFlowProvider();
      const p = req.payload as {
        summary?: string;
        apiKey?: string;
        privateKeyHex?: string;
        cadenceAddress?: string;
        network?: string;
      };
      const net = p.network === "mainnet" || p.network === "testnet" ? p.network : "testnet";
      flow.setNetwork(net);
      const pk =
        typeof p.privateKeyHex === "string" && p.privateKeyHex.length > 0
          ? p.privateKeyHex
          : p.apiKey;
      const data = await flow.prepareSponsored(
        { summary: p.summary },
        pk,
        typeof p.cadenceAddress === "string" ? p.cadenceAddress : undefined,
      );
      return { ok: true, data };
    }
    case "flow.estimate_fee": {
      const flow = await getFlowProvider();
      const p = req.payload as {
        network?: string;
        executionEffort?: number;
        priorityRaw?: number;
        dataSizeMB?: string;
      };
      const net = p.network === "mainnet" ? "mainnet" : "testnet";
      flow.setNetwork(net);
      try {
        const data = await flow.estimateScheduleFee({
          network: net,
          executionEffort: typeof p.executionEffort === "number" ? p.executionEffort : 100,
          priorityRaw: typeof p.priorityRaw === "number" ? p.priorityRaw : 1,
          dataSizeMB: typeof p.dataSizeMB === "string" ? p.dataSizeMB : "0.0001",
        });
        return { ok: true, data };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "estimate_failed";
        return { ok: false, errorCode: "flow_estimate_failed", errorMessage: msg, data: {} };
      }
    }
    case "flow.schedule_transaction": {
      const flow = await getFlowProvider();
      const p = req.payload as {
        network?: string;
        privateKeyHex?: string;
        cadenceAddress?: string;
        intentJson?: string;
        keyId?: number;
      };
      const net = p.network === "mainnet" ? "mainnet" : "testnet";
      flow.setNetwork(net);
      const pk = typeof p.privateKeyHex === "string" ? p.privateKeyHex : "";
      const addr = typeof p.cadenceAddress === "string" ? p.cadenceAddress : "";
      const intent = typeof p.intentJson === "string" ? p.intentJson : "{}";
      if (!pk || !addr) {
        return {
          ok: false,
          errorCode: "missing_params",
          errorMessage: "privateKeyHex and cadenceAddress required",
          data: {},
        };
      }
      try {
        const data = await flow.submitScheduleIntent({
          network: net,
          privateKeyHex: pk,
          cadenceAddress: addr,
          intentJson: intent,
          keyId: typeof p.keyId === "number" ? p.keyId : undefined,
        });
        return { ok: true, data };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "schedule_failed";
        return { ok: false, errorCode: "flow_schedule_failed", errorMessage: msg, data: {} };
      }
    }
    case "flow.cancel_scheduled": {
      const flow = await getFlowProvider();
      const p = req.payload as {
        network?: string;
        privateKeyHex?: string;
        cadenceAddress?: string;
        targetTxId?: string;
        keyId?: number;
      };
      const net = p.network === "mainnet" ? "mainnet" : "testnet";
      flow.setNetwork(net);
      const pk = typeof p.privateKeyHex === "string" ? p.privateKeyHex : "";
      const addr = typeof p.cadenceAddress === "string" ? p.cadenceAddress : "";
      const target = typeof p.targetTxId === "string" ? p.targetTxId.trim() : "";
      if (!pk || !addr || !target) {
        return {
          ok: false,
          errorCode: "missing_params",
          errorMessage: "privateKeyHex, cadenceAddress, targetTxId required",
          data: {},
        };
      }
      try {
        const data = await flow.submitCancelIntent({
          network: net,
          privateKeyHex: pk,
          cadenceAddress: addr,
          targetTxId: target,
          keyId: typeof p.keyId === "number" ? p.keyId : undefined,
        });
        return { ok: true, data };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "cancel_failed";
        return { ok: false, errorCode: "flow_cancel_failed", errorMessage: msg, data: {} };
      }
    }
    case "flow.setup_cron": {
      const flow = await getFlowProvider();
      const p = req.payload as {
        network?: string;
        privateKeyHex?: string;
        cadenceAddress?: string;
        cronExpression?: string;
        keyId?: number;
      };
      const net = p.network === "mainnet" ? "mainnet" : "testnet";
      flow.setNetwork(net);
      const pk = typeof p.privateKeyHex === "string" ? p.privateKeyHex : "";
      const addr = typeof p.cadenceAddress === "string" ? p.cadenceAddress : "";
      const cron = typeof p.cronExpression === "string" ? p.cronExpression : "";
      if (!pk || !addr || !cron) {
        return {
          ok: false,
          errorCode: "missing_params",
          errorMessage: "privateKeyHex, cadenceAddress, cronExpression required",
          data: {},
        };
      }
      try {
        const data = await flow.submitCronIntent({
          network: net,
          privateKeyHex: pk,
          cadenceAddress: addr,
          cronExpression: cron,
          keyId: typeof p.keyId === "number" ? p.keyId : undefined,
        });
        return { ok: true, data };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "cron_failed";
        return { ok: false, errorCode: "flow_cron_failed", errorMessage: msg, data: {} };
      }
    }
    case "flow.get_tx_status": {
      const flow = await getFlowProvider();
      const p = req.payload as { txId?: string };
      const txId = typeof p.txId === "string" ? p.txId.trim() : "";
      if (!txId) {
        return { ok: false, errorCode: "missing_params", errorMessage: "txId required", data: {} };
      }
      try {
        const data = await flow.getTxStatus(txId);
        return { ok: true, data };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "status_failed";
        return { ok: false, errorCode: "flow_status_failed", errorMessage: msg, data: {} };
      }
    }
    case "flow.actions_preview": {
      const m = await import("./providers/flow-actions.js");
      const p = req.payload as {
        kind?: string;
        fromSymbol?: string;
        toSymbol?: string;
        swapperProtocol?: string;
        legCount?: number;
        flasherProtocol?: string;
      };
      const kind = typeof p.kind === "string" ? p.kind : "dca";
      if (kind === "rebalance") {
        const data = m.buildRebalanceCompositionPreview({
          swapperProtocol: typeof p.swapperProtocol === "string" ? p.swapperProtocol : "incrementfi",
          legCount: typeof p.legCount === "number" ? p.legCount : 1,
        });
        return { ok: true, data: data as unknown as Record<string, unknown> };
      }
      if (kind === "flash") {
        const data = m.buildFlashLoanPreview({
          flasherProtocol: typeof p.flasherProtocol === "string" ? p.flasherProtocol : "incrementfi",
          swapperProtocol: typeof p.swapperProtocol === "string" ? p.swapperProtocol : "incrementfi",
        });
        return { ok: true, data: data as unknown as Record<string, unknown> };
      }
      const data = m.buildDcaCompositionPreview({
        fromSymbol: typeof p.fromSymbol === "string" ? p.fromSymbol : "USDC",
        toSymbol: typeof p.toSymbol === "string" ? p.toSymbol : "FLOW",
        swapperProtocol: typeof p.swapperProtocol === "string" ? p.swapperProtocol : "incrementfi",
      });
      return { ok: true, data: data as unknown as Record<string, unknown> };
    }
    case "flow.bridge_preview": {
      const m = await import("./providers/flow-bridge.js");
      const p = req.payload as {
        direction?: string;
        tokenRef?: string;
        amountHint?: string;
      };
      const dir =
        p.direction === "evm_to_cadence" ? "evm_to_cadence" : "cadence_to_evm";
      const data = m.bridgePreview({
        direction: dir,
        tokenRef: typeof p.tokenRef === "string" ? p.tokenRef : "unknown",
        amountHint: typeof p.amountHint === "string" ? p.amountHint : "0",
      });
      return { ok: true, data: { ...data, hints: m.listBridgeableHints() } };
    }
    case "filecoin.backup_upload": {
      const filecoin = await getFilecoinProvider();
      const p = req.payload as {
        ciphertextHex?: string;
        scope?: unknown;
        apiKey?: string;
        policy?: FilecoinPolicyPayload;
      };
      const hex = p.ciphertextHex ?? "";
      const out = await filecoin.uploadBackup({
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
      const filecoin = await getFilecoinProvider();
      const p = req.payload as { cid?: string; apiKey?: string };
      const prev = await filecoin.fetchRestorePreview(p.cid ?? "", p.apiKey);
      return {
        ok: true,
        data: {
          ciphertextHex: prev.ciphertextHex,
          note: prev.note,
        },
      };
    }
    case "filecoin.cost_quote": {
      const filecoin = await getFilecoinProvider();
      const p = req.payload as { apiKey?: string; dataSize?: number; withCDN?: boolean };
      const apiKey = typeof p.apiKey === "string" ? p.apiKey : "";
      const dataSize = typeof p.dataSize === "number" ? p.dataSize : 1024;
      const q = await filecoin.quoteUploadCosts({
        apiKey,
        dataSize,
        withCDN: p.withCDN !== false,
      });
      return { ok: true, data: { ...q } };
    }
    case "filecoin.storage_prepare": {
      const filecoin = await getFilecoinProvider();
      const p = req.payload as { apiKey?: string; dataSize?: number };
      const apiKey = typeof p.apiKey === "string" ? p.apiKey : "";
      const dataSize = typeof p.dataSize === "number" ? p.dataSize : 1024;
      const prep = await filecoin.prepareStorage({ apiKey, dataSize });
      return { ok: true, data: { ...prep } };
    }
    case "filecoin.datasets_list": {
      const filecoin = await getFilecoinProvider();
      const p = req.payload as { apiKey?: string };
      const apiKey = typeof p.apiKey === "string" ? p.apiKey : "";
      const list = await filecoin.listDataSets({ apiKey });
      return { ok: true, data: { dataSets: list } };
    }
    case "filecoin.dataset_terminate": {
      const filecoin = await getFilecoinProvider();
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
      const txHash = await filecoin.terminateDataSet({ apiKey, dataSetId });
      return { ok: true, data: { txHash } };
    }

    // -----------------------------------------------------------------------
    // Vincent SDK operations
    // -----------------------------------------------------------------------

    case "vincent.configure": {
      const vincent = await getVincentProvider();
      const { setVincentConfig } = await import("./providers/vincent.js");
      const p = req.payload as {
        appId?: string;
        delegateeKey?: string;
        abilityCids?: Record<string, string>;
      };
      setVincentConfig({
        appId: typeof p.appId === "string" ? p.appId : undefined,
        delegateeKey: typeof p.delegateeKey === "string" ? p.delegateeKey : undefined,
        abilityCids: p.abilityCids,
      });
      const _ = vincent; // ensure loaded
      return { ok: true, data: { configured: true } };
    }

    case "vincent.consent_url": {
      const vincent = await getVincentProvider();
      const p = req.payload as { redirectUri?: string };
      const redirectUri = typeof p.redirectUri === "string" ? p.redirectUri : "shadow://vincent-consent";
      const url = vincent.getConsentUrl(redirectUri);
      return { ok: true, data: { url } };
    }

    case "vincent.verify_jwt": {
      const vincent = await getVincentProvider();
      const p = req.payload as { jwt?: string; expectedAudience?: string };
      const jwtString = typeof p.jwt === "string" ? p.jwt.trim() : "";
      if (!jwtString) {
        return { ok: false, errorCode: "missing_jwt", errorMessage: "jwt is required", data: {} };
      }
      try {
        const info = await vincent.verifyJwt(
          jwtString,
          typeof p.expectedAudience === "string" ? p.expectedAudience : undefined,
        );
        return { ok: true, data: info as unknown as Record<string, unknown> };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "jwt_error";
        return { ok: false, errorCode: "jwt_invalid", errorMessage: msg, data: {} };
      }
    }

    case "vincent.wallet_status": {
      const vincent = await getVincentProvider();
      const p = req.payload as {
        pkpAddress?: string;
        grantedAbilities?: string[];
        hasConsent?: boolean;
        consentExpiresAt?: number;
      };
      const data = vincent.walletStatus({
        pkpAddress: typeof p.pkpAddress === "string" ? p.pkpAddress : undefined,
        grantedAbilities: Array.isArray(p.grantedAbilities) ? p.grantedAbilities as string[] : undefined,
        hasConsent: typeof p.hasConsent === "boolean" ? p.hasConsent : false,
        consentExpiresAt: typeof p.consentExpiresAt === "number" ? p.consentExpiresAt : undefined,
      });
      return { ok: true, data };
    }

    case "vincent.execute_ability": {
      const vincent = await getVincentProvider();
      const p = req.payload as {
        abilityCid?: string;
        operation?: string;
        params?: Record<string, unknown>;
        delegateeKey?: string;
      };

      // Resolve CID: either explicit or from operation name
      let cid = typeof p.abilityCid === "string" ? p.abilityCid.trim() : "";
      if (!cid && typeof p.operation === "string") {
        cid = vincent.resolveAbilityCid(p.operation) ?? "";
      }

      const abilityParams = p.params ?? {};
      const delegateeKey = typeof p.delegateeKey === "string" ? p.delegateeKey : undefined;

      const result = await vincent.executeAbility(cid, abilityParams, delegateeKey);
      return { ok: result.success, data: result as unknown as Record<string, unknown> };
    }

    case "vincent.precheck_policy": {
      // Lightweight local policy check before submitting ability execution
      const p = req.payload as {
        notionalUsd?: number;
        operation?: string;
        protocol?: string;
        perTradeLimitUsd?: number;
        dailySpendLimitUsd?: number;
        approvalThresholdUsd?: number;
        allowedProtocols?: string[];
      };
      const notional = typeof p.notionalUsd === "number" ? p.notionalUsd : 0;
      const perTrade = typeof p.perTradeLimitUsd === "number" ? p.perTradeLimitUsd : 100;
      const daily = typeof p.dailySpendLimitUsd === "number" ? p.dailySpendLimitUsd : 500;
      const approval = typeof p.approvalThresholdUsd === "number" ? p.approvalThresholdUsd : 1000;
      const whitelist = Array.isArray(p.allowedProtocols) ? p.allowedProtocols as string[] : [];

      let allowed = true;
      let reason = "within_limits";

      if (notional > perTrade) { allowed = false; reason = "exceeds_per_trade_limit"; }
      else if (notional > daily) { allowed = false; reason = "exceeds_daily_spend_limit"; }
      else if (notional > approval) { allowed = false; reason = "requires_manual_approval"; }
      else if (p.protocol && whitelist.length > 0 && !whitelist.includes(p.protocol)) {
        allowed = false;
        reason = "protocol_not_whitelisted";
      }

      return {
        ok: true,
        data: {
          allowed,
          reason,
          notionalUsd: notional,
          enforcedBy: "local-policy",
          note: "On-chain Vincent policies provide additional enforcement at execution time.",
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
