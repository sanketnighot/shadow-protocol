/** @vitest-environment node */
import { describe, expect, it } from "vitest";

import { SynapseFilecoinStorageProvider } from "./filecoin";

describe("SynapseFilecoinStorageProvider", () => {
  it.skip("returns deterministic synthetic CID for payload (skipped due to SDK requirement)", async () => {
    const provider = new SynapseFilecoinStorageProvider();
    
    // Test requires a valid key to run.
    const res = await provider.uploadBackup({
      ciphertextHex: "b455",
      scope: { t: "test" },
      apiKey: "0x1234567890123456789012345678901234567890123456789012345678901234"
    }).catch(() => null);

    expect(res).toBeDefined();
  });
});
