import { scValToNative, xdr } from "@stellar/stellar-sdk";

export interface CreatedEvent {
  distributionId: number;
  creator: string;
  token: string;
  merkleRoot: string;
  totalAmount: bigint;
  endTime: bigint;
}

export interface StreamCreatedEvent {
  distributionId: number;
  issuer: string;
  token: string;
  merkleRoot: string;
  totalAmount: bigint;
  startTime: bigint;
  cliffTime: bigint;
  endTime: bigint;
}

export interface ClaimedEvent {
  distributionId: number;
  recipient: string;
  index: number;
  amount: bigint;
}

export interface ClawedBackEvent {
  distributionId: number;
  issuer: string;
  amount: bigint;
  timestamp: bigint;
}

export interface CancelledEvent {
  distributionId: number;
  creator: string;
  remainingAmount: bigint;
}

export interface SweptEvent {
  distributionId: number;
  creator: string;
  recipient: string;
  sweptAmount: bigint;
}

export interface UpgradedEvent {
  oldVersion: number;
  newVersion: number;
  newWasmHash: string;
}

export type DecodedContractEvent =
  | { type: "created"; event: CreatedEvent }
  | { type: "stream"; event: StreamCreatedEvent }
  | { type: "claimed"; event: ClaimedEvent }
  | { type: "clawback"; event: ClawedBackEvent }
  | { type: "cancel"; event: CancelledEvent }
  | { type: "swept"; event: SweptEvent }
  | { type: "upgrade"; event: UpgradedEvent };

function toBigInt(value: unknown, label: string): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error(`${label} must be an integer`);
    }
    return BigInt(value);
  }
  if (typeof value === "string") {
    return BigInt(value);
  }
  throw new Error(`Invalid ${label} event value`);
}

function toNumber(value: unknown, label: string): number {
  return Number(toBigInt(value, label));
}

function toText(value: unknown, label: string): string {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object" && "toString" in value) {
    return String(value);
  }
  throw new Error(`Invalid ${label} event value`);
}

function toHex(value: unknown): string {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return Buffer.from(value).toString("hex");
  }
  if (Array.isArray(value)) {
    return Buffer.from(value.map((byte) => Number(byte))).toString("hex");
  }
  if (typeof value === "string") {
    return value.replace(/^0x/, "");
  }
  throw new Error("Invalid bytes event value");
}

function toArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} event data must be a tuple`);
  }
  return value;
}

function topicName(topics: xdr.ScVal[]): string | null {
  if (topics.length === 0) {
    return null;
  }
  const native = scValToNative(topics[0]);
  return typeof native === "string" ? native : null;
}

/**
 * Decodes contract events emitted by the v2 YieldStreamDistributor.
 */
export function decodeContractEvent(
  topics: xdr.ScVal[],
  data: xdr.ScVal
): DecodedContractEvent | null {
  const name = topicName(topics);
  if (!name) {
    return null;
  }

  switch (name) {
    case "created": {
      const distributionId = toNumber(scValToNative(topics[1]), "distribution_id");
      const creator = toText(scValToNative(topics[2]), "creator");
      const raw = toArray(scValToNative(data), "created");
      return {
        type: "created",
        event: {
          distributionId,
          creator,
          token: toText(raw[0], "token"),
          merkleRoot: toHex(raw[1]),
          totalAmount: toBigInt(raw[2], "total_amount"),
          endTime: toBigInt(raw[3], "end_time"),
        },
      };
    }
    case "stream": {
      const distributionId = toNumber(scValToNative(topics[1]), "distribution_id");
      const issuer = toText(scValToNative(topics[2]), "issuer");
      const raw = toArray(scValToNative(data), "stream");
      return {
        type: "stream",
        event: {
          distributionId,
          issuer,
          token: toText(raw[0], "token"),
          merkleRoot: toHex(raw[1]),
          totalAmount: toBigInt(raw[2], "total_amount"),
          startTime: toBigInt(raw[3], "start_time"),
          cliffTime: toBigInt(raw[4], "cliff_time"),
          endTime: toBigInt(raw[5], "end_time"),
        },
      };
    }
    case "claimed": {
      const distributionId = toNumber(scValToNative(topics[1]), "distribution_id");
      const recipient = toText(scValToNative(topics[2]), "recipient");
      const raw = toArray(scValToNative(data), "claimed");
      return {
        type: "claimed",
        event: {
          distributionId,
          recipient,
          index: toNumber(raw[0], "index"),
          amount: toBigInt(raw[1], "amount"),
        },
      };
    }
    case "clawback": {
      const distributionId = toNumber(scValToNative(topics[1]), "distribution_id");
      const issuer = toText(scValToNative(topics[2]), "issuer");
      const raw = toArray(scValToNative(data), "clawback");
      return {
        type: "clawback",
        event: {
          distributionId,
          issuer,
          amount: toBigInt(raw[0], "amount"),
          timestamp: toBigInt(raw[1], "timestamp"),
        },
      };
    }
    case "cancel": {
      const distributionId = toNumber(scValToNative(topics[1]), "distribution_id");
      const creator = toText(scValToNative(topics[2]), "creator");
      return {
        type: "cancel",
        event: {
          distributionId,
          creator,
          remainingAmount: toBigInt(scValToNative(data), "remaining_amount"),
        },
      };
    }
    case "swept": {
      const distributionId = toNumber(scValToNative(topics[1]), "distribution_id");
      const creator = toText(scValToNative(topics[2]), "creator");
      const raw = toArray(scValToNative(data), "swept");
      return {
        type: "swept",
        event: {
          distributionId,
          creator,
          recipient: toText(raw[0], "recipient"),
          sweptAmount: toBigInt(raw[1], "swept_amount"),
        },
      };
    }
    case "upgrade": {
      const oldVersion = toNumber(scValToNative(topics[1]), "old_version");
      const newVersion = toNumber(scValToNative(topics[2]), "new_version");
      return {
        type: "upgrade",
        event: {
          oldVersion,
          newVersion,
          newWasmHash: toHex(scValToNative(data)),
        },
      };
    }
    default:
      return null;
  }
}
