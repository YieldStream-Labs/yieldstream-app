import crypto from "crypto";
import { Address } from "@stellar/stellar-sdk";

export const LEAF_PREFIX = Buffer.from([0x00]);
export const NODE_PREFIX = Buffer.from([0x01]);

/**
 * Computes the SHA-256 digest of input buffer.
 */
export function sha256(data: Buffer): Buffer {
  return crypto.createHash("sha256").update(data).digest();
}

/**
 * Serializes a 64-bit unsigned integer to an 8-byte big-endian buffer.
 */
export function u64ToBe(val: bigint | number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(val));
  return buf;
}

/**
 * Serializes a 32-bit unsigned integer to a 4-byte big-endian buffer.
 */
export function u32ToBe(val: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(Number(val));
  return buf;
}

/**
 * Converts a JS BigInt / 128-bit integer into a 16-byte big-endian Buffer (two's complement).
 */
export function i128ToBe(val: bigint | number | string): Buffer {
  let v = BigInt(val);
  if (v < 0n) {
    v = (1n << 128n) + v;
  }
  const buf = Buffer.alloc(16);
  for (let i = 15; i >= 0; i--) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return buf;
}

/**
 * Serializes a Stellar Address to its canonical ScVal XDR bytes.
 */
export function addressToXdr(address: string): Buffer {
  const addr = Address.fromString(address);
  const scVal = addr.toScVal();
  return Buffer.from(scVal.toXDR());
}

/**
 * Computes leaf hash according to YieldStream Merkle Encoding V1:
 * sha256( Buffer.concat([ 0x00, u64_be(id), u32_be(index), address_xdr, i128_be(amount) ]) )
 */
export function computeLeaf(
  distributionId: bigint | number,
  index: number,
  claimantAddress: string,
  amount: bigint | number | string
): Buffer {
  const idBuf = u64ToBe(distributionId);
  const indexBuf = u32ToBe(index);
  const addrXdr = addressToXdr(claimantAddress);
  const amountBuf = i128ToBe(amount);
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
 * Verifies a Merkle inclusion proof against a root and leaf hash.
 */
export function verifyProof(proof: Buffer[], root: Buffer, leaf: Buffer): boolean {
  let current = leaf;
  for (const sibling of proof) {
    current = hashPair(current, sibling);
  }
  return Buffer.compare(current, root) === 0;
}
