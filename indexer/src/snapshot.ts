import { DistributionSnapshotJSON, MerkleTree } from "@yieldstream/merkle";
import { fetchAssetHolders } from "./fetcher.js";
import { calculateAllocations } from "./math.js";
import { SnapshotConfig } from "./types.js";

/**
 * Builds a deterministic Merkle distribution snapshot from Horizon holders and BigInt math.
 */
export async function buildSnapshot(
  config: SnapshotConfig
): Promise<DistributionSnapshotJSON> {
  const holders = await fetchAssetHolders(
    config.horizonUrl,
    config.assetCode,
    config.assetIssuer,
    config.snapshotLedger
  );

  const allocations = calculateAllocations(holders, config.poolAmount);

  if (allocations.length === 0) {
    throw new Error(
      `No non-zero holders found for asset ${config.assetCode}:${config.assetIssuer}`
    );
  }

  const leafItems = allocations.map((a) => ({
    index: a.index,
    claimant: a.claimant,
    amount: a.rewardAmount,
  }));

  const tree = new MerkleTree(config.distributionId, leafItems);
  return tree.toJSON();
}
