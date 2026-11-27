import { VestingSchedule } from "./types.js";

function timestampToBigInt(value: bigint | number): bigint {
  if (typeof value === "number" && !Number.isInteger(value)) {
    throw new Error(`Timestamp must be an integer (received ${value})`);
  }
  return BigInt(value);
}

/**
 * Computes the linearly vested portion of `amount` at `timestamp`.
 *
 * Mirrors the contract's vesting.rs: before the cliff nothing is vested, at or
 * after the end time the full amount is vested, and in between vesting is
 * linear from the start time using integer division (rounded down).
 */
export function vestedAmount(
  schedule: VestingSchedule,
  amount: bigint,
  timestamp: bigint | number
): bigint {
  if (amount <= 0n) {
    return 0n;
  }

  const now = timestampToBigInt(timestamp);
  if (now < schedule.cliffTime) {
    return 0n;
  }
  if (now >= schedule.endTime) {
    return amount;
  }

  const duration = schedule.endTime - schedule.startTime;
  if (duration <= 0n) {
    return amount;
  }

  const elapsed = now > schedule.startTime ? now - schedule.startTime : 0n;
  if (elapsed >= duration) {
    return amount;
  }

  return (amount * elapsed) / duration;
}

export interface ClaimableAmountParams {
  amount: bigint;
  alreadyClaimed: bigint;
  timestamp: bigint | number;
  schedule?: VestingSchedule | null;
  clawbackTime?: bigint | null;
}

/**
 * Computes the amount a recipient can claim right now.
 *
 * If a stream was clawed back, vesting is frozen at the clawback timestamp.
 */
export function claimableAmount(params: ClaimableAmountParams): bigint {
  const vestingTime = params.clawbackTime ?? timestampToBigInt(params.timestamp);
  const vested = params.schedule
    ? vestedAmount(params.schedule, params.amount, vestingTime)
    : params.amount;

  return vested > params.alreadyClaimed ? vested - params.alreadyClaimed : 0n;
}

/**
 * Computes the portion of an allocation that is still locked (not vested).
 */
export function lockedAmount(
  schedule: VestingSchedule | null | undefined,
  amount: bigint,
  timestamp: bigint | number
): bigint {
  if (!schedule) {
    return 0n;
  }
  const vested = vestedAmount(schedule, amount, timestamp);
  return amount > vested ? amount - vested : 0n;
}
