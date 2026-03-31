/**
 * Cadence transaction submission with local secp256k1 key (proposer = payer = authorizer).
 */

import type { AccountAuthorization } from "@onflow/sdk";
import * as sdk from "@onflow/sdk";
import { sansPrefix, withPrefix } from "@onflow/util-address";

import { configureFclNetwork, type FlowNetworkId } from "./flow-network.js";
import { createSecp256k1SigningFunction } from "./flow-signing.js";

type ArgBuilder = (arg: typeof sdk.arg, t: typeof sdk.t) => unknown[];

export type SubmitCadenceResult = {
  txId: string;
};

interface FlowAccountKeyJson {
  index?: number;
  sign_algo?: string;
  signAlgo?: string;
}

interface FlowAccountJson {
  keys?: FlowAccountKeyJson[];
}

/** Prefer secp256k1 + SHA-256 key to match Ethereum-derived session keys. */
export async function resolveDefaultKeyIndex(
  restBaseUrl: string,
  cadenceAddress: string,
): Promise<number> {
  const addr = sansPrefix(cadenceAddress);
  const url = `${restBaseUrl.replace(/\/$/, "")}/v1/accounts/0x${addr}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    return 0;
  }
  const data = (await res.json()) as FlowAccountJson;
  const keys = data.keys ?? [];
  const secp = keys.find((k) => {
    const sa = (k.sign_algo ?? k.signAlgo ?? "").toString().toLowerCase();
    return sa.includes("secp256k1");
  });
  if (secp && typeof secp.index === "number") {
    return secp.index;
  }
  const first = keys[0];
  return typeof first?.index === "number" ? first.index : 0;
}

function buildArgsArray(builder: ArgBuilder): ReturnType<typeof sdk.args> {
  const list = builder(sdk.arg, sdk.t) as Parameters<typeof sdk.args>[0];
  return sdk.args(list);
}

export async function submitCadenceWithSessionKey(opts: {
  network: FlowNetworkId;
  cadence: string;
  args: ArgBuilder;
  privateKeyHex: string;
  cadenceAddress: string;
  keyId?: number;
  limit?: number;
}): Promise<SubmitCadenceResult> {
  const { network, cadence, args, privateKeyHex, cadenceAddress } = opts;
  const limit = opts.limit ?? 250;
  if (!privateKeyHex || privateKeyHex.length < 32) {
    throw new Error("Unlock your SHADOW wallet session to sign Flow transactions.");
  }

  configureFclNetwork(network);
  const restUrl = network === "mainnet" ? "https://rest-mainnet.onflow.org" : "https://rest-testnet.onflow.org";
  const keyId =
    opts.keyId ?? (await resolveDefaultKeyIndex(restUrl, cadenceAddress));

  const addrPrefixed = withPrefix(sansPrefix(cadenceAddress));
  const signingFn = createSecp256k1SigningFunction(addrPrefixed, privateKeyHex, keyId);
  const authz = sdk.authorization(
    sansPrefix(addrPrefixed),
    signingFn,
    keyId,
  ) as AccountAuthorization;

  const ixBuilders: unknown[] = [
    sdk.transaction(cadence),
    buildArgsArray(args),
    // Runtime `proposer` accepts a single authorization; generated `.d.ts` incorrectly expects an array.
    (sdk.proposer as (a: AccountAuthorization) => ReturnType<typeof sdk.proposer>)(authz),
    (sdk.payer as (a: AccountAuthorization) => ReturnType<typeof sdk.payer>)(authz),
    sdk.authorizations([authz]),
    sdk.limit(limit),
  ];
  const response = await sdk.send(ixBuilders as Parameters<typeof sdk.send>[0]);

  const decoded = (await sdk.decode(response)) as { transactionId?: string };
  const txId = decoded.transactionId;
  if (!txId) {
    throw new Error("Flow submit returned no transactionId.");
  }
  return { txId };
}

export async function getTransactionStatus(txId: string): Promise<Record<string, unknown>> {
  const response = await sdk.send([sdk.getTransactionStatus(txId)]);
  const decoded = (await sdk.decode(response)) as Record<string, unknown>;
  return decoded;
}

export async function runCadenceScript<T = unknown>(opts: {
  network: FlowNetworkId;
  cadence: string;
  args: ArgBuilder;
}): Promise<T> {
  configureFclNetwork(opts.network);
  const response = await sdk.send([
    sdk.script(opts.cadence),
    buildArgsArray(opts.args),
  ]);
  return sdk.decode(response) as Promise<T>;
}
