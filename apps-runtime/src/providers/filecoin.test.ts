/** @vitest-environment node */
import { describe, expect, it } from "vitest";

import { StubFilecoinStorageProvider } from "./filecoin";

describe("StubFilecoinStorageProvider", () => {
  it("returns deterministic synthetic CID for payload", () => {
    const p = new StubFilecoinStorageProvider();
    const a = p.uploadBackup({ ciphertextHex: "abcd", scope: {} });
    const b = p.uploadBackup({ ciphertextHex: "abcd", scope: {} });
    expect(a.cid).toBe(b.cid);
    expect(a.cid.startsWith("bafyshadow")).toBe(true);
  });
});
