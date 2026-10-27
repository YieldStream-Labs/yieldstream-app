import fs from "fs";
import { DistributionSnapshotJSON, MerkleTree } from "../../merkle/dist/index.js";
import { Distribution, YieldStreamClient } from "../../sdk/dist/index.js";

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
    metaHash?: string;
  };
  recomputed: {
    merkleRoot: string;
    leafCount: number;
    metaHash?: string;
  };
  checks: {
    rootMatch: boolean;
    leafCountMatch: boolean;
    metaHashMatch: boolean;
  };
  errors?: string[];
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

  let recomputedRoot = "";
  let recomputedLeafCount = 0;
  let recomputedMetaHash = "";

  if (options.snapshotFile) {
    const raw = fs.readFileSync(options.snapshotFile, "utf-8");
    const snapshot: DistributionSnapshotJSON = JSON.parse(raw);

    const items = snapshot.leaves.map((l) => ({
      index: l.index,
      claimant: l.claimant,
      amount: BigInt(l.amount),
    }));

    const tree = new MerkleTree(options.distributionId, items);
    recomputedRoot = tree.getRootHex();
    recomputedLeafCount = tree.getLeafCount();
    recomputedMetaHash = tree.toJSON().meta_hash;
  } else {
    throw new Error(
      "Either --file <snapshot_json> or asset parameters must be supplied to recompute tree"
    );
  }

  const rootMatch =
    onChainDist.merkleRoot.toLowerCase() === recomputedRoot.toLowerCase();
  const leafCountMatch = onChainDist.leafCount === recomputedLeafCount;
  const metaHashMatch = onChainDist.metaHash
    ? onChainDist.metaHash.toLowerCase() === recomputedMetaHash.toLowerCase()
    : true;

  const matched = rootMatch && leafCountMatch && metaHashMatch;

  return {
    matched,
    distributionId: String(options.distributionId),
    onChain: {
      merkleRoot: onChainDist.merkleRoot,
      leafCount: onChainDist.leafCount,
      metaHash: onChainDist.metaHash,
    },
    recomputed: {
      merkleRoot: recomputedRoot,
      leafCount: recomputedLeafCount,
      metaHash: recomputedMetaHash,
    },
    checks: {
      rootMatch,
      leafCountMatch,
      metaHashMatch,
    },
  };
}
