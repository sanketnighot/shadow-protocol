import { Synapse } from '@filoz/synapse-sdk';
import { privateKeyToAccount } from 'viem/accounts';
import { filecoinCalibration } from 'viem/chains';
import type { Chain } from '@filoz/synapse-core/chains';

export type FilecoinUploadInput = {
  ciphertextHex: string;
  scope: unknown;
  apiKey?: string;
};

export type FilecoinUploadResult = {
  cid: string;
  bytesReported: number;
  scope?: unknown;
  transport: string;
};

export interface FilecoinStorageProvider {
  uploadBackup(input: FilecoinUploadInput): Promise<FilecoinUploadResult>;
  fetchRestorePreview(cid: string, apiKey?: string): Promise<{ ciphertextHex: string; note: string }>;
}

export class SynapseFilecoinStorageProvider implements FilecoinStorageProvider {
  private getClient(apiKey: string): Synapse {
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
        withCDN: true,
      });
    } catch (e: any) {
      throw new Error(`Invalid Filecoin Private Key: ${e.message}`);
    }
  }

  async uploadBackup(input: FilecoinUploadInput): Promise<FilecoinUploadResult> {
    const synapse = this.getClient(input.apiKey || "");
    
    const buf = Buffer.from(input.ciphertextHex, "hex");
    const dataArray = new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
    
    try {
      const result = await synapse.storage.upload(dataArray, {
        signal: AbortSignal.timeout(30000)
      });
      return {
        cid: typeof result.pieceCid === 'string' ? result.pieceCid : result.pieceCid?.toString() || "unknown",
        bytesReported: result.size,
        scope: input.scope,
        transport: "synapse_sdk",
      };
    } catch (e: any) {
      throw new Error(`Filecoin upload failed: ${e.message}`);
    }
  }

  async fetchRestorePreview(cid: string, apiKey?: string): Promise<{ ciphertextHex: string; note: string }> {
    const synapse = this.getClient(apiKey || "");
    
    try {
      const resultBytes = await synapse.storage.download({
        pieceCid: cid,
        withCDN: true
      });
      return {
        ciphertextHex: Buffer.from(resultBytes).toString("hex"),
        note: "Restored successfully from Filecoin DSN via Synapse.",
      };
    } catch (e: any) {
      throw new Error(`Filecoin download failed: ${e.message}`);
    }
  }
}

export const defaultFilecoinProvider: FilecoinStorageProvider = new SynapseFilecoinStorageProvider();
