import { Address, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";
import { Distribution, DistributionStatus } from "./types.js";

/**
 * Converts a Stellar address (e.g. G... or C...) to an ScVal Address.
 */
export function addressToScVal(address: string): xdr.ScVal {
  return Address.fromString(address).toScVal();
}

/**
 * Converts a 64-bit integer into an ScVal::U64.
 */
export function u64ToScVal(val: bigint | number): xdr.ScVal {
  return nativeToScVal(BigInt(val), { type: "u64" });
}

/**
 * Converts a 32-bit integer into an ScVal::U32.
 */
export function u32ToScVal(val: number): xdr.ScVal {
  return nativeToScVal(Number(val), { type: "u32" });
}

/**
 * Converts a 128-bit integer into an ScVal::I128.
 */
export function i128ToScVal(val: bigint | number | string): xdr.ScVal {
  return nativeToScVal(BigInt(val), { type: "i128" });
}

/**
 * Converts a 32-byte buffer or hex string to an ScVal::Bytes (BytesN<32>).
 */
export function bytes32ToScVal(val: Buffer | string): xdr.ScVal {
  const buf = typeof val === "string" ? Buffer.from(val.replace(/^0x/, ""), "hex") : val;
  if (buf.length !== 32) {
    throw new Error(`Expected 32 bytes, received ${buf.length} bytes`);
  }
  return xdr.ScVal.scvBytes(buf);
}

/**
 * Converts an array of 32-byte hashes into an ScVal::Vec(BytesN<32>).
 */
export function vecBytes32ToScVal(proof: (Buffer | string)[]): xdr.ScVal {
  const scVals = proof.map((p) => bytes32ToScVal(p));
  return xdr.ScVal.scvVec(scVals);
}

/**
 * Parses a Soroban contract result ScVal into a typed Distribution object.
 */
export function scValToDistribution(scVal: xdr.ScVal): Distribution {
  const native = scValToNative(scVal);

  if (!native || typeof native !== "object") {
    throw new Error("Invalid Distribution ScVal structure");
  }

  return {
    id: BigInt(native.id ?? 0),
    issuer: String(native.creator ?? native.issuer ?? ""),
    token: String(native.token ?? ""),
    merkleRoot: Buffer.isBuffer(native.merkle_root)
      ? native.merkle_root.toString("hex")
      : String(native.merkle_root ?? ""),
    totalAmount: BigInt(native.total_amount ?? native.total ?? 0),
    claimedAmount: BigInt(native.claimed_amount ?? 0),
    leafCount: Number(native.num_recipients ?? native.leaf_count ?? 0),
    claimedCount: Number(native.claimed_count ?? 0),
    createdAt: BigInt(native.created_at ?? native.opens_at ?? 0),
    expiresAt: BigInt(native.end_time ?? native.expires_at ?? 0),
    status: Number(native.status ?? DistributionStatus.Active),
    snapshotLedger: native.snapshot_ledger ? Number(native.snapshot_ledger) : undefined,
    metaHash: native.meta_hash ? Buffer.from(native.meta_hash).toString("hex") : undefined,
  };
}
