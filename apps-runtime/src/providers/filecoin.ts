import { Synapse, formatUnits, parseUnits } from '@filoz/synapse-sdk';
import { privateKeyToAccount } from 'viem/accounts';
import { filecoinCalibration } from 'viem/chains';
import type { Chain } from '@filoz/synapse-core/chains';

const USDFC_DECIMALS = 18;

export type FilecoinUploadInput = {
  ciphertextHex: string;
  scope: unknown;
  apiKey?: string;
  policy?: {
    ttl: number;
    redundancy: number;
    costLimit: number;
    autoRenew: boolean;
  };
};

export type FilecoinUploadResult = {
  cid: string;
  bytesReported: number;
  scope?: unknown;
  transport: string;
  policyApplied?: unknown;
  /** @deprecated Prefer storageRatePerMonthUsdfc / depositNeededUsdfc */
  estimatedCostFil?: number;
  storageRatePerMonthUsdfc?: string;
  depositNeededUsdfc?: string;
  uploadReady?: boolean;
  uploadComplete?: boolean;
  requestedCopies?: number;
  committedCopies?: number;
  copiesMeta?: Array<{
    providerId: string;
    dataSetId: string;
    pieceId: string;
    role: string;
    isNewDataSet: boolean;
  }>;
};

export interface FilecoinStorageProvider {
  uploadBackup(input: FilecoinUploadInput): Promise<FilecoinUploadResult>;
  fetchRestorePreview(cid: string, apiKey?: string): Promise<{ ciphertextHex: string; note: string }>;
  quoteUploadCosts(input: {
    apiKey: string;
    dataSize: number;
    withCDN?: boolean;
  }): Promise<{
    ratePerMonthUsdfc: string;
    depositNeededUsdfc: string;
    ready: boolean;
    needsFwssMaxApproval: boolean;
  }>;
  listDataSets(input: { apiKey: string }): Promise<unknown[]>;
  prepareStorage(input: { apiKey: string; dataSize: number }): Promise<{
    ready: boolean;
    ratePerMonthUsdfc: string;
    depositNeededUsdfc: string;
    hasTransaction: boolean;
  }>;
  terminateDataSet(input: { apiKey: string; dataSetId: string }): Promise<string>;
}

export class SynapseFilecoinStorageProvider implements FilecoinStorageProvider {
  private getClient(apiKey: string, withCDN = true): Synapse {
    if (!apiKey) {
      throw new Error("Missing Filecoin API Key. Please reconfigure the Filecoin app.");
    }
    const keyStr = apiKey.startsWith("0x") ? apiKey : `0x${apiKey}`;
    try {
      const account = privateKeyToAccount(keyStr as `0x${string}`);
      return Synapse.create({
        account,
        chain: filecoinCalibration as unknown as Chain,
        source: "shadow-protocol",
        withCDN,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Invalid Filecoin Private Key: ${msg}`);
    }
  }

  async quoteUploadCosts(input: {
    apiKey: string;
    dataSize: number;
    withCDN?: boolean;
  }): Promise<{
    ratePerMonthUsdfc: string;
    depositNeededUsdfc: string;
    ready: boolean;
    needsFwssMaxApproval: boolean;
  }> {
    const synapse = this.getClient(input.apiKey, input.withCDN ?? true);
    const size = BigInt(Math.max(0, input.dataSize));
    const costs = await synapse.storage.getUploadCosts({
      dataSize: size,
      withCDN: input.withCDN ?? true,
    });
    return {
      ratePerMonthUsdfc: formatUnits(costs.rate.perMonth, { decimals: USDFC_DECIMALS }),
      depositNeededUsdfc: formatUnits(costs.depositNeeded, { decimals: USDFC_DECIMALS }),
      ready: costs.ready,
      needsFwssMaxApproval: costs.needsFwssMaxApproval,
    };
  }

  async prepareStorage(input: { apiKey: string; dataSize: number }): Promise<{
    ready: boolean;
    ratePerMonthUsdfc: string;
    depositNeededUsdfc: string;
    hasTransaction: boolean;
  }> {
    const synapse = this.getClient(input.apiKey);
    const dataSize = BigInt(Math.max(127, input.dataSize));
    const prep = await synapse.storage.prepare({ dataSize });
    return {
      ready: prep.costs.ready,
      ratePerMonthUsdfc: formatUnits(prep.costs.rate.perMonth, { decimals: USDFC_DECIMALS }),
      depositNeededUsdfc: formatUnits(prep.costs.depositNeeded, { decimals: USDFC_DECIMALS }),
      hasTransaction: prep.transaction != null,
    };
  }

  async listDataSets(input: { apiKey: string }): Promise<unknown[]> {
    const synapse = this.getClient(input.apiKey);
    const sets = await synapse.storage.findDataSets();
    return sets.map((ds) => ({
      pdpVerifierDataSetId: ds.pdpVerifierDataSetId?.toString?.() ?? String(ds.pdpVerifierDataSetId),
      activePieceCount: ds.activePieceCount?.toString?.() ?? String(ds.activePieceCount),
      isLive: ds.isLive,
      withCDN: ds.withCDN,
      metadata: ds.metadata,
    }));
  }

  async terminateDataSet(input: { apiKey: string; dataSetId: string }): Promise<string> {
    const synapse = this.getClient(input.apiKey);
    const id = BigInt(input.dataSetId);
    return synapse.storage.terminateDataSet({ dataSetId: id });
  }

  async uploadBackup(input: FilecoinUploadInput): Promise<FilecoinUploadResult> {
    const synapse = this.getClient(input.apiKey || "");

    const buf = Buffer.from(input.ciphertextHex, "hex");
    const dataArray = new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
    if (dataArray.length < 127) {
      throw new Error(
        `Backup payload too small (${dataArray.length} bytes); Synapse requires at least 127 bytes for PieceCID.`,
      );
    }

    const copies = Math.min(
      5,
      Math.max(1, Math.floor(input.policy?.redundancy ?? 2)),
    );

    let ratePerMonthUsdfc = "0";
    let depositNeededUsdfc = "0";
    let uploadReady = true;
    try {
      const costs = await synapse.storage.getUploadCosts({
        dataSize: BigInt(dataArray.length),
        withCDN: true,
      });
      ratePerMonthUsdfc = formatUnits(costs.rate.perMonth, { decimals: USDFC_DECIMALS });
      depositNeededUsdfc = formatUnits(costs.depositNeeded, { decimals: USDFC_DECIMALS });
      uploadReady = costs.ready;

      const limit = input.policy?.costLimit;
      if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
        try {
          const maxDeposit = parseUnits(limit.toFixed(18), USDFC_DECIMALS);
          if (costs.depositNeeded > maxDeposit) {
            throw new Error(
              `Quoted deposit ${depositNeededUsdfc} USDFC exceeds configured cost cap (${limit}). Fund the wallet or raise the cap in settings.`,
            );
          }
        } catch (e) {
          if (e instanceof Error && e.message.includes("exceeds")) {
            throw e;
          }
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("exceeds")) {
        throw e;
      }
    }

    try {
      const result = await synapse.storage.upload(dataArray, {
        copies,
        signal: AbortSignal.timeout(120_000),
        metadata: {
          Application: "shadow-protocol",
          Category: "agent-state",
        },
        pieceMetadata: {
          kind: "encrypted-snapshot",
        },
      });

      const copiesMeta = result.copies.map((c) => ({
        providerId: c.providerId.toString(),
        dataSetId: c.dataSetId.toString(),
        pieceId: c.pieceId.toString(),
        role: c.role,
        isNewDataSet: c.isNewDataSet,
      }));

      const cidStr =
        typeof result.pieceCid === "string"
          ? result.pieceCid
          : result.pieceCid?.toString() || "unknown";

      const estFil = Number.parseFloat(ratePerMonthUsdfc) || 0.0001;

      return {
        cid: cidStr,
        bytesReported: result.size,
        scope: input.scope,
        transport: "synapse_sdk",
        policyApplied: input.policy,
        estimatedCostFil: Number(estFil.toFixed(8)),
        storageRatePerMonthUsdfc: ratePerMonthUsdfc,
        depositNeededUsdfc,
        uploadReady,
        uploadComplete: result.complete,
        requestedCopies: result.requestedCopies,
        committedCopies: result.copies.length,
        copiesMeta,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Filecoin upload failed: ${msg}`);
    }
  }

  async fetchRestorePreview(cid: string, apiKey?: string): Promise<{ ciphertextHex: string; note: string }> {
    const synapse = this.getClient(apiKey || "");

    try {
      const resultBytes = await synapse.storage.download({
        pieceCid: cid,
        withCDN: true,
      });
      return {
        ciphertextHex: Buffer.from(resultBytes).toString("hex"),
        note: "Restored successfully from Filecoin DSN via Synapse.",
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Filecoin download failed: ${msg}`);
    }
  }
}

export const defaultFilecoinProvider: FilecoinStorageProvider = new SynapseFilecoinStorageProvider();
