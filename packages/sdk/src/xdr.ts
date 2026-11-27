import {
  Address,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { Distribution, DistributionStatus, VestingSchedule } from "./types.js";

const U32_MAX = 0xffffffffn;

type NativeRecord = Record<string, unknown>;

export function toBigInt(value: unknown, label: string): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error(`${label} must be an integer (received ${value})`);
    }
    return BigInt(value);
  }
  if (typeof value === "string") {
    return BigInt(value);
  }
  throw new Error(`${label} must be an integer-compatible value`);
}

export function toU32(value: bigint | number, label = "value"): number {
  const big = toBigInt(value, label);
  if (big < 0n || big > U32_MAX) {
    throw new Error(`${label} must fit in a u32 (received ${big.toString(10)})`);
  }
  return Number(big);
}

function asRecord(value: unknown, label: string): NativeRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label} ScVal structure`);
  }
  return value as NativeRecord;
}

function recordValue(record: NativeRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }
  return undefined;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object" && "toString" in value) {
    return String(value);
  }
  throw new Error(`Invalid ${label} ScVal value`);
}

function hexValue(value: unknown): string {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return Buffer.from(value).toString("hex");
  }
  if (Array.isArray(value)) {
    return Buffer.from(value.map((byte) => Number(byte))).toString("hex");
  }
  if (typeof value === "string") {
    return value.replace(/^0x/, "");
  }
  throw new Error("Invalid bytes ScVal value");
}

function bytes32(value: Buffer | Uint8Array | string): Buffer {
  const buf = typeof value === "string"
    ? Buffer.from(value.replace(/^0x/, ""), "hex")
    : Buffer.from(value);
  if (buf.length !== 32) {
    throw new Error(`Expected 32 bytes, received ${buf.length} bytes`);
  }
  return buf;
}

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
  return nativeToScVal(toBigInt(val, "u64"), { type: "u64" });
}

/**
 * Converts a 32-bit integer into an ScVal::U32.
 */
export function u32ToScVal(val: bigint | number): xdr.ScVal {
  return nativeToScVal(toU32(val, "u32"), { type: "u32" });
}

/**
 * Converts a 128-bit integer into an ScVal::I128.
 */
export function i128ToScVal(val: bigint | number | string): xdr.ScVal {
  return nativeToScVal(toBigInt(val, "i128"), { type: "i128" });
}

/**
 * Converts a 32-byte buffer or hex string to an ScVal::Bytes (BytesN<32>).
 */
export function bytes32ToScVal(val: Buffer | Uint8Array | string): xdr.ScVal {
  return xdr.ScVal.scvBytes(bytes32(val));
}

/**
 * Converts an array of 32-byte hashes into an ScVal::Vec(BytesN<32>).
 */
export function vecBytes32ToScVal(
  proof: (Buffer | Uint8Array | string)[]
): xdr.ScVal {
  return xdr.ScVal.scvVec(proof.map((p) => bytes32ToScVal(p)));
}

/**
 * Parses a Soroban contract result ScVal into a typed Distribution object.
 */
export function scValToDistribution(scVal: xdr.ScVal): Distribution {
  const record = asRecord(scValToNative(scVal), "Distribution");

  return {
    id: Number(toBigInt(recordValue(record, ["id", "distribution_id"]) ?? 0, "id")),
    creator: stringValue(recordValue(record, ["creator", "issuer"]), "creator"),
    token: stringValue(recordValue(record, ["token"]), "token"),
    merkleRoot: hexValue(recordValue(record, ["merkle_root"])),
    totalAmount: toBigInt(
      recordValue(record, ["total_amount", "total"]) ?? 0,
      "total_amount"
    ),
    claimedAmount: toBigInt(
      recordValue(record, ["claimed_amount"]) ?? 0,
      "claimed_amount"
    ),
    numRecipients: Number(
      toBigInt(
        recordValue(record, ["num_recipients", "leaf_count"]) ?? 0,
        "num_recipients"
      )
    ),
    claimedCount: Number(
      toBigInt(recordValue(record, ["claimed_count"]) ?? 0, "claimed_count")
    ),
    createdAt: toBigInt(
      recordValue(record, ["created_at"]) ?? 0,
      "created_at"
    ),
    endTime: toBigInt(
      recordValue(record, ["end_time", "expires_at"]) ?? 0,
      "end_time"
    ),
    status: Number(
      toBigInt(recordValue(record, ["status"]) ?? DistributionStatus.Active, "status")
    ) as DistributionStatus,
  };
}

/**
 * Parses a Soroban Option<VestingSchedule> ScVal into a typed schedule.
 */
export function scValToVestingSchedule(
  scVal: xdr.ScVal
): VestingSchedule | null {
  const native = scValToNative(scVal);
  if (native === null || native === undefined) {
    return null;
  }
  const record = asRecord(native, "VestingSchedule");
  return {
    startTime: toBigInt(recordValue(record, ["start_time"]) ?? 0, "start_time"),
    cliffTime: toBigInt(recordValue(record, ["cliff_time"]) ?? 0, "cliff_time"),
    endTime: toBigInt(recordValue(record, ["end_time"]) ?? 0, "end_time"),
  };
}

/**
 * Parses a Soroban Option<u64> ScVal into a bigint or null.
 */
export function scValToOptionalU64(scVal: xdr.ScVal): bigint | null {
  const native = scValToNative(scVal);
  if (native === null || native === undefined) {
    return null;
  }
  return toBigInt(native, "u64");
}

/**
 * Parses a Soroban u32/i128 ScVal into a bigint.
 */
export function scValToBigInt(scVal: xdr.ScVal): bigint {
  return toBigInt(scValToNative(scVal), "integer");
}

/**
 * Parses a Soroban boolean ScVal into a boolean.
 */
export function scValToBoolean(scVal: xdr.ScVal): boolean {
  return Boolean(scValToNative(scVal));
}
