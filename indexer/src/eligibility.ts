import {
  DistributionStatus,
  VestingSchedule,
  claimableAmount,
  lockedAmount,
  vestedAmount,
} from "../../packages/sdk/dist/index.js";

export interface EligibilityInput {
  distributionId: number;
  creator: string;
  token: string;
  merkleRoot: string;
  status: number;
  totalAmount: string;
  claimedAmount: string;
  numRecipients: number;
  claimedCount: number;
  distributionEndTime: string;
  clawbackTime: string | null;
  schedule: VestingSchedule | null;
  leafIndex: number;
  recipient: string;
  leafAmount: string;
  leaf: string;
  proof: string[];
  leafClaimedAmount: string;
  fullyClaimed: boolean;
}

export interface EligibleStream {
  distributionId: number;
  creator: string;
  token: string;
  merkleRoot: string;
  status: number;
  totalAmount: string;
  distributionEndTime: string;
  clawbackTime: string | null;
  schedule: {
    startTime: string;
    cliffTime: string;
    endTime: string;
  } | null;
  leaf: {
    index: number;
    recipient: string;
    amount: string;
    leaf: string;
    proof: string[];
  };
  claimedAmount: string;
  vestedAmount: string;
  claimableAmount: string;
  lockedAmount: string;
  fullyClaimed: boolean;
  expired: boolean;
  isClaimable: boolean;
}

/**
 * Computes vested, claimable, and locked balances for one recipient leaf.
 * Pure function used by the API and covered by unit tests.
 */
export function computeEligibility(
  input: EligibilityInput,
  now: bigint
): EligibleStream {
  const amount = BigInt(input.leafAmount);
  const alreadyClaimed = BigInt(input.leafClaimedAmount);
  const clawbackTime = input.clawbackTime ? BigInt(input.clawbackTime) : null;
  const distributionEndTime = BigInt(input.distributionEndTime);
  const vestingTime = clawbackTime ?? now;

  const vested = input.schedule
    ? vestedAmount(input.schedule, amount, vestingTime)
    : amount;
  const claimable = claimableAmount({
    amount,
    alreadyClaimed,
    timestamp: now,
    schedule: input.schedule,
    clawbackTime,
  });
  const locked = lockedAmount(input.schedule, amount, vestingTime);

  const status = input.status as DistributionStatus;
  const expired =
    distributionEndTime > 0n && now >= distributionEndTime;
  const claimableStatus =
    status === DistributionStatus.Active ||
    status === DistributionStatus.ClawedBack;
  const isClaimable = claimableStatus && !expired && claimable > 0n;

  return {
    distributionId: input.distributionId,
    creator: input.creator,
    token: input.token,
    merkleRoot: input.merkleRoot,
    status: input.status,
    totalAmount: input.totalAmount,
    distributionEndTime: input.distributionEndTime,
    clawbackTime: input.clawbackTime,
    schedule: input.schedule
      ? {
          startTime: input.schedule.startTime.toString(10),
          cliffTime: input.schedule.cliffTime.toString(10),
          endTime: input.schedule.endTime.toString(10),
        }
      : null,
    leaf: {
      index: input.leafIndex,
      recipient: input.recipient,
      amount: input.leafAmount,
      leaf: input.leaf,
      proof: input.proof,
    },
    claimedAmount: input.leafClaimedAmount,
    vestedAmount: vested.toString(10),
    claimableAmount: claimable.toString(10),
    lockedAmount: locked.toString(10),
    fullyClaimed: input.fullyClaimed,
    expired,
    isClaimable,
  };
}
