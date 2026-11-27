export enum DistributionStatus {
  Active = 0,
  Cancelled = 1,
  Completed = 2,
  Expired = 3,
  ClawedBack = 4,
}

export type DistributionId = bigint | number;

export interface VestingSchedule {
  startTime: bigint;
  cliffTime: bigint;
  endTime: bigint;
}

export interface Distribution {
  id: number;
  creator: string;
  token: string;
  merkleRoot: string;
  totalAmount: bigint;
  claimedAmount: bigint;
  numRecipients: number;
  claimedCount: number;
  createdAt: bigint;
  endTime: bigint;
  status: DistributionStatus;
  vestingSchedule?: VestingSchedule;
  clawbackTime?: bigint;
}

export interface CreateDistributionParams {
  creator: string;
  token: string;
  root: Buffer | Uint8Array | string;
  totalAmount: bigint;
  numRecipients: number;
  endTime: bigint | number;
}

export interface CreateStreamParams {
  issuer: string;
  token: string;
  root: Buffer | Uint8Array | string;
  totalAmount: bigint;
  numRecipients: number;
  startTime: bigint | number;
  cliffTime: bigint | number;
  endTime: bigint | number;
}

export interface ClaimParams {
  distributionId: DistributionId;
  index: number;
  recipient: string;
  amount: bigint;
  proof: (Buffer | Uint8Array | string)[];
}

export interface VerifyProofParams {
  proof: (Buffer | Uint8Array | string)[];
  root: Buffer | Uint8Array | string;
  leaf: Buffer | Uint8Array | string;
}

export interface YieldStreamConfig {
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
}
