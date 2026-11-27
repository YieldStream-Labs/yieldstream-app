import fs from "fs";
import {
  DistributionSnapshotJSON,
  MerkleTree,
  SnapshotVestingSchedule,
} from "../../merkle/dist/index.js";
import {
  Distribution,
  VestingSchedule,
  YieldStreamClient,
} from "../../sdk/dist/index.js";

export interface VerifyOptions {
  distributionId: bigint | number;
  contractId: string;
  rpcUrl: string;
  networkPassphrase: string;
  horizonUrl?: string;
  snapshotFile?: string;
  assetCode?: string;
  assetIssuer?: string;
}

export interface VerificationResult {
  matched: boolean;
  distributionId: string;
  onChain: {
    merkleRoot: string;
    leafCount: number;
    totalAmount: string;
    vestingSchedule: SerializedVestingSchedule | null;
  };
  recomputed: {
    merkleRoot: string;
    leafCount: number;
    totalAmount: string;
    metaHash: string;
    vestingSchedule: SerializedVestingSchedule | null;
  };
  checks: {
    rootMatch: boolean;
    leafCountMatch: boolean;
    totalAmountMatch: boolean;
    snapshotMetaHashMatch: boolean;
    vestingMatch: boolean;
  };
  errors?: string[];
}

interface SerializedVestingSchedule {
  startTime: string;
  cliffTime: string;
  endTime: string;
}

function serializeSchedule(
  schedule: VestingSchedule | SnapshotVestingSchedule | null | undefined
): SerializedVestingSchedule | null {
  if (!schedule) {
    return null;
  }
  if ("startTime" in schedule) {
    return {
      startTime: schedule.startTime.toString(10),
      cliffTime: schedule.cliffTime.toString(10),
      endTime: schedule.endTime.toString(10),
    };
  }
  return {
    startTime: schedule.start_time,
    cliffTime: schedule.cliff_time,
    endTime: schedule.end_time,
  };
}

function schedulesEqual(
  a: SerializedVestingSchedule | null,
  b: SerializedVestingSchedule | null
): boolean {
  if (!a || !b) {
    return a === b;
  }
  return (
    a.startTime === b.startTime &&
    a.cliffTime === b.cliffTime &&
    a.endTime === b.endTime
  );
}

export async function verifyDistribution(
  options: VerifyOptions
): Promise<VerificationResult> {
  const client = new YieldStreamClient({
    rpcUrl: options.rpcUrl,
    networkPassphrase: options.networkPassphrase,
    contractId: options.contractId,
  });

  const onChainDist: Distribution = await client.getDistribution(
    options.distributionId
  );
  const onChainSchedule = serializeSchedule(
    await client.getVestingSchedule(options.distributionId)
  );

  if (!options.snapshotFile) {
    throw new Error(
      "Either --file <snapshot_json> or asset parameters must be supplied to recompute tree"
    );
  }

  const raw = fs.readFileSync(options.snapshotFile, "utf-8");
  const snapshot: DistributionSnapshotJSON = JSON.parse(raw);

  const items = snapshot.leaves.map((l) => ({
    index: l.index,
    claimant: l.claimant,
    amount: BigInt(l.amount),
  }));

  const vestingSchedule = snapshot.vesting_schedule
    ? {
        startTime: BigInt(snapshot.vesting_schedule.start_time),
        cliffTime: BigInt(snapshot.vesting_schedule.cliff_time),
        endTime: BigInt(snapshot.vesting_schedule.end_time),
      }
    : undefined;

  const tree = new MerkleTree(BigInt(options.distributionId), items, {
    vestingSchedule,
  });
  const recomputedSnapshot = tree.toJSON();
  const recomputedRoot = tree.getRootHex();
  const recomputedLeafCount = tree.getLeafCount();
  const recomputedTotalAmount = tree.items
    .reduce((acc, item) => acc + item.amount, 0n)
    .toString(10);
  const recomputedSchedule = serializeSchedule(snapshot.vesting_schedule);

  const rootMatch =
    onChainDist.merkleRoot.toLowerCase() === recomputedRoot.toLowerCase();
  const leafCountMatch = onChainDist.numRecipients === recomputedLeafCount;
  const totalAmountMatch =
    onChainDist.totalAmount === BigInt(recomputedTotalAmount);
  const snapshotMetaHashMatch =
    !snapshot.meta_hash || snapshot.meta_hash === recomputedSnapshot.meta_hash;
  const vestingMatch = schedulesEqual(onChainSchedule, recomputedSchedule);

  const matched =
    rootMatch &&
    leafCountMatch &&
    totalAmountMatch &&
    snapshotMetaHashMatch &&
    vestingMatch;

  return {
    matched,
    distributionId: String(options.distributionId),
    onChain: {
      merkleRoot: onChainDist.merkleRoot,
      leafCount: onChainDist.numRecipients,
      totalAmount: onChainDist.totalAmount.toString(10),
      vestingSchedule: onChainSchedule,
    },
    recomputed: {
      merkleRoot: recomputedRoot,
      leafCount: recomputedLeafCount,
      totalAmount: recomputedTotalAmount,
      metaHash: recomputedSnapshot.meta_hash,
      vestingSchedule: recomputedSchedule,
    },
    checks: {
      rootMatch,
      leafCountMatch,
      totalAmountMatch,
      snapshotMetaHashMatch,
      vestingMatch,
    },
  };
}
