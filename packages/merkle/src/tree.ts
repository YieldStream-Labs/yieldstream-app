import { computeLeaf, hashPair, verifyProof, sha256, assertU32 } from "./hash.js";

export interface LeafItem {
  index: number;
  claimant: string;
  amount: bigint;
}

export interface VestingSchedule {
  startTime: bigint;
  cliffTime: bigint;
  endTime: bigint;
}

export interface SnapshotVestingSchedule {
  start_time: string;
  cliff_time: string;
  end_time: string;
}

export interface LeafSnapshot {
  index: number;
  claimant: string;
  amount: string; // BigInt as decimal string
  leaf: string; // 32-byte hex
  proof: string[]; // array of 32-byte hex
}

export interface DistributionSnapshotJSON {
  distribution_id: string;
  leaf_count: number;
  total_amount: string;
  merkle_root: string;
  meta_hash: string;
  leaves: LeafSnapshot[];
  vesting_schedule?: SnapshotVestingSchedule;
}

export interface MerkleTreeOptions {
  vestingSchedule?: VestingSchedule;
}

export class MerkleTree {
  public readonly distributionId: bigint;
  public readonly items: LeafItem[];
  public readonly vestingSchedule?: VestingSchedule;
  private readonly leafHashes: Buffer[];
  private readonly treeLevels: Buffer[][];
  private readonly root: Buffer;

  constructor(
    distributionId: bigint | number,
    items: LeafItem[],
    options: MerkleTreeOptions = {}
  ) {
    if (!items || items.length === 0) {
      throw new Error("Cannot build MerkleTree with empty leaves");
    }
    assertU32(distributionId, "distribution_id");
    this.distributionId = BigInt(distributionId);
    this.items = [...items].sort((a, b) => a.index - b.index);
    this.vestingSchedule = options.vestingSchedule;

    // Validate sequential index
    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i].index !== i) {
        throw new Error(`Non-sequential leaf index at position ${i}: expected ${i}, found ${this.items[i].index}`);
      }
    }

    // 1. Compute leaf hashes
    this.leafHashes = this.items.map((item) =>
      computeLeaf(this.distributionId, item.index, item.claimant, item.amount)
    );

    // 2. Pad to next power of 2 by duplicating last leaf
    let currentLevel = [...this.leafHashes];
    const n = currentLevel.length;
    let targetSize = 1;
    while (targetSize < n) {
      targetSize *= 2;
    }

    while (currentLevel.length < targetSize) {
      currentLevel.push(currentLevel[currentLevel.length - 1]);
    }

    this.treeLevels = [currentLevel];

    // 3. Build tree levels upwards to root
    while (currentLevel.length > 1) {
      const nextLevel: Buffer[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = currentLevel[i + 1];
        nextLevel.push(hashPair(left, right));
      }
      this.treeLevels.push(nextLevel);
      currentLevel = nextLevel;
    }

    this.root = currentLevel[0];
  }

  public getRoot(): Buffer {
    return this.root;
  }

  public getRootHex(): string {
    return this.root.toString("hex");
  }

  public getLeafCount(): number {
    return this.items.length;
  }

  public getLeaf(index: number): Buffer {
    if (index < 0 || index >= this.items.length) {
      throw new Error(`Index out of bounds: ${index}`);
    }
    return this.leafHashes[index];
  }

  public getProof(index: number): Buffer[] {
    if (index < 0 || index >= this.items.length) {
      throw new Error(`Index out of bounds: ${index}`);
    }

    const proof: Buffer[] = [];
    let idx = index;

    for (let levelIdx = 0; levelIdx < this.treeLevels.length - 1; levelIdx++) {
      const level = this.treeLevels[levelIdx];
      const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
      proof.push(level[siblingIdx]);
      idx = Math.floor(idx / 2);
    }

    return proof;
  }

  public getProofHex(index: number): string[] {
    return this.getProof(index).map((buf) => buf.toString("hex"));
  }

  public verify(index: number): boolean {
    const proof = this.getProof(index);
    const leaf = this.getLeaf(index);
    return verifyProof(proof, this.root, leaf);
  }

  public getVestingScheduleJSON(): SnapshotVestingSchedule | undefined {
    if (!this.vestingSchedule) {
      return undefined;
    }
    return {
      start_time: this.vestingSchedule.startTime.toString(10),
      cliff_time: this.vestingSchedule.cliffTime.toString(10),
      end_time: this.vestingSchedule.endTime.toString(10),
    };
  }

  public toJSON(): DistributionSnapshotJSON {
    const totalAmount = this.items.reduce((acc, item) => acc + item.amount, 0n);

    const leaves: LeafSnapshot[] = this.items.map((item, idx) => ({
      index: item.index,
      claimant: item.claimant,
      amount: item.amount.toString(10),
      leaf: this.leafHashes[idx].toString("hex"),
      proof: this.getProofHex(idx),
    }));

    const vestingSchedule = this.getVestingScheduleJSON();
    const rawJsonForMeta = JSON.stringify({
      distribution_id: this.distributionId.toString(10),
      leaf_count: this.items.length,
      total_amount: totalAmount.toString(10),
      merkle_root: this.getRootHex(),
      leaves,
      ...(vestingSchedule ? { vesting_schedule: vestingSchedule } : {}),
    });

    const metaHash = sha256(Buffer.from(rawJsonForMeta, "utf-8")).toString("hex");

    return {
      distribution_id: this.distributionId.toString(10),
      leaf_count: this.items.length,
      total_amount: totalAmount.toString(10),
      merkle_root: this.getRootHex(),
      meta_hash: metaHash,
      leaves,
      ...(vestingSchedule ? { vesting_schedule: vestingSchedule } : {}),
    };
  }
}

/**
 * Reconstructs a MerkleTree from a serialized distribution snapshot.
 */
export function treeFromSnapshot(snapshot: DistributionSnapshotJSON): MerkleTree {
  const items: LeafItem[] = snapshot.leaves.map((leaf) => ({
    index: leaf.index,
    claimant: leaf.claimant,
    amount: BigInt(leaf.amount),
  }));

  const vestingSchedule = snapshot.vesting_schedule
    ? {
        startTime: BigInt(snapshot.vesting_schedule.start_time),
        cliffTime: BigInt(snapshot.vesting_schedule.cliff_time),
        endTime: BigInt(snapshot.vesting_schedule.end_time),
      }
    : undefined;

  return new MerkleTree(BigInt(snapshot.distribution_id), items, {
    vestingSchedule,
  });
}
