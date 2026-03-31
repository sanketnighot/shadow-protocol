/**
 * ECDSA secp256k1 + SHA2-256 signing for Flow transactions (matches common Flow account keys).
 * The hex `message` from FCL is domain-tagged payload / envelope bytes; Flow hashes with SHA-256 before ECDSA.
 */

import { createHash } from "node:crypto";

import { ec as EC } from "elliptic";

import { sansPrefix, withPrefix } from "@onflow/util-address";

const ec = new EC("secp256k1");

export type FlowSignable = {
  message: string;
  addr?: string;
  keyId?: number | string;
};

function parsePrivateKeyHex(hex: string): Buffer {
  const clean = hex.trim().replace(/^0x/i, "");
  if (clean.length < 64) {
    throw new Error("Invalid private key length.");
  }
  return Buffer.from(clean, "hex");
}

/**
 * Returns an FCL signing function for `fcl.authorization(addr, fn, keyId)`.
 * @param flowAddress — 16-hex Cadence address, with or without 0x
 */
export function createSecp256k1SigningFunction(
  flowAddress: string,
  privateKeyHex: string,
  keyId: number,
): (signable?: FlowSignable) => Promise<{ addr: string; keyId: number; signature: string }> {
  const keyPair = ec.keyFromPrivate(parsePrivateKeyHex(privateKeyHex), "hex");
  const addrPrefixed = withPrefix(sansPrefix(flowAddress));

  return async (signable?: FlowSignable) => {
    const msgHex = signable?.message;
    if (!msgHex || msgHex.length < 2) {
      throw new Error("Missing Flow signable message.");
    }
    const msgBytes = Buffer.from(msgHex, "hex");
    const msgHash = createHash("sha256").update(msgBytes).digest();
    const sig = keyPair.sign(msgHash, { canonical: true });
    const r = sig.r.toArrayLike(Buffer, "be", 32);
    const s = sig.s.toArrayLike(Buffer, "be", 32);
    const signature = Buffer.concat([r, s]).toString("hex");
    return {
      addr: sansPrefix(addrPrefixed),
      keyId,
      signature,
    };
  };
}
