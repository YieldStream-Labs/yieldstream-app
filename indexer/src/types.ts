export interface Holder {
  address: string;
  rawBalance: bigint; // balance in smallest integer units (stroops)
}

export interface SnapshotConfig {
  horizonUrl: string;
  assetCode: string;
  assetIssuer: string;
  snapshotLedger?: number;
  distributionId: bigint | number;
  poolAmount: bigint;
}

export interface DividendAllocation {
  index: number;
  claimant: string;
  holdingBalance: bigint;
  rewardAmount: bigint;
}
