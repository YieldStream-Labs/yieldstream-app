import crypto from "crypto";
import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk";

export const LEAF_PREFIX = Buffer.from([0x00]);
export const NODE_PREFIX = Buffer.from([0x01]);

const U32_MAX = 0xffffffffn;

/**
 * Computes the SHA-256 digest of input buffer.
 */
export function sha256(data: Buffer): Buffer {
  return crypto.createHash("sha256").update(data).digest();
}

/**
 * Validates that a value fits in an unsigned 32-bit integer.
 */
export function assertU32(val: bigint | number, label = "value"): number {
  const big = BigInt(val);
  if (big < 0n || big > U32_MAX) {
    throw new Error(`${label} must fit in a u32 (received ${big.toString(10)})`);
  }
  return Number(big);
}

/**
 * Serializes a u32 as the canonical Soroban ScVal XDR used by the contract.
 * The contract performs `u32.to_xdr(env)`, which is equivalent to ScVal::U32.
 */
export function u32ToXdr(val: bigint | number): Buffer {
  return Buffer.from(xdr.ScVal.scvU32(assertU32(val, "u32")).toXDR());
}

/**
 * Serializes an i128 amount as its canonical ScVal XDR representation.
 */
export function i128ToXdr(val: bigint | number | string): Buffer {
  return Buffer.from(nativeToScVal(BigInt(val), { type: "i128" }).toXDR());
}

/**
 * Serializes a Stellar Address to its canonical ScVal XDR bytes.
 */
export function addressToXdr(address: string): Buffer {
  const addr = Address.fromString(address);
  return Buffer.from(addr.toScVal().toXDR());
}

/**
 * Computes leaf hash according to YieldStream Merkle Encoding V2:
 * sha256( Buffer.concat([ 0x00, XDR(u32 id), XDR(u32 index), XDR(address), XDR(i128 amount) ]) )
 */
export function computeLeaf(
  distributionId: bigint | number,
  index: number,
  claimantAddress: string,
  amount: bigint | number | string
): Buffer {
  const idBuf = u32ToXdr(distributionId);
  const indexBuf = u32ToXdr(index);
  const addrXdr = addressToXdr(claimantAddress);
  const amountBuf = i128ToXdr(amount);
  return sha256(Buffer.concat([LEAF_PREFIX, idBuf, indexBuf, addrXdr, amountBuf]));
}

/**
 * Hashes two sibling nodes with lexicographical sort:
 * sha256( Buffer.concat([ 0x01, min(a,b), max(a,b) ]) )
 */
export function hashPair(a: Buffer, b: Buffer): Buffer {
  const cmp = Buffer.compare(a, b);
  const [left, right] = cmp <= 0 ? [a, b] : [b, a];
  return sha256(Buffer.concat([NODE_PREFIX, left, right]));
}

/**
 * Converts a 32-byte hash from hex into a Buffer.
 */
export function bytes32FromHex(hex: string): Buffer {
  const normalized = hex.replace(/^0x/, "");
  if (normalized.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error(`Expected a 32-byte hex string, received ${hex}`);
  }
  return Buffer.from(normalized, "hex");
}

/**
 * Verifies a Merkle inclusion proof against a root and leaf hash.
 */
export function verifyProof(proof: Buffer[], root: Buffer, leaf: Buffer): boolean {
  let current = leaf;
  for (const sibling of proof) {
    current = hashPair(current, sibling);
  }
  return Buffer.compare(current, root) === 0;
}
