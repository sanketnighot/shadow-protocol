/**
 * Filecoin backup transport boundary — swap `StubFilecoinStorageProvider` for Synapse or another
 * production SDK without changing Rust IPC or backup payload construction.
 */

import { createHash } from "node:crypto";

export type FilecoinUploadInput = {
  ciphertextHex: string;
  scope: unknown;
};

export type FilecoinUploadResult = {
  cid: string;
  bytesReported: number;
  transport: string;
};

/** Contract for encrypted backup upload / restore fetch (storage-only; trust is local ciphertext). */
export interface FilecoinStorageProvider {
  uploadBackup(input: FilecoinUploadInput): FilecoinUploadResult;
  fetchRestorePreview(cid: string): { ciphertextHex: string; note: string };
}

export class StubFilecoinStorageProvider implements FilecoinStorageProvider {
  uploadBackup(input: FilecoinUploadInput): FilecoinUploadResult {
    const syntheticCid = `bafyshadow${createHash("sha256").update(input.ciphertextHex).digest("hex").slice(0, 24)}`;
    return {
      cid: syntheticCid,
      bytesReported: input.ciphertextHex.length / 2,
      transport: "adapter_stub",
    };
  }

  fetchRestorePreview(_cid: string): { ciphertextHex: string; note: string } {
    return {
      ciphertextHex: "00",
      note: "Stub fetch — wire Synapse / production SDK behind this boundary.",
    };
  }
}

export const defaultFilecoinProvider: FilecoinStorageProvider = new StubFilecoinStorageProvider();
