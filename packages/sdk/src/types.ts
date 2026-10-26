export enum DistributionStatus {
  Active = 0,
  Cancelled = 1,
  Completed = 2,
  Expired = 3,
}

export interface Distribution {
  id: bigint;
  issuer: string;
  token: string;
  merkleRoot: string;
  totalAmount: bigint;
  claimedAmount: bigint;
  leafCount: number;
  claimedCount: number;
  createdAt: bigint;
  expiresAt: bigint;
  status: DistributionStatus;
  snapshotLedger?: number;
  metaHash?: string;
}

export interface CreateDistributionParams {
  issuer: string;
  token: string;
  total: bigint;
  root: Buffer | string;
  leafCount: number;
  snapshotLedger?: number;
  metaHash?: Buffer | string;
  opensAt?: bigint | number;
  expiresAt: bigint | number;
}

export interface ClaimParams {
  id: bigint | number;
  index: number;
  claimant: string;
  amount: bigint;
  proof: (Buffer | string)[];
}

export interface YieldStreamConfig {
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
}
