import test from "node:test";
import assert from "node:assert";
import { MerkleTree } from "../../merkle/dist/index.js";
import { Keypair } from "@stellar/stellar-sdk";

test("verifier recomputes identical root from leaf array", () => {
  const kp1 = Keypair.random();
  const kp2 = Keypair.random();

  const items = [
    { index: 0, claimant: kp1.publicKey(), amount: 1000n },
    { index: 1, claimant: kp2.publicKey(), amount: 2000n },
  ];

  const tree = new MerkleTree(1n, items);
  const snapshot = tree.toJSON();

  // Recompute from snapshot leaves
  const recomputedItems = snapshot.leaves.map((l) => ({
    index: l.index,
    claimant: l.claimant,
    amount: BigInt(l.amount),
  }));

  const recomputedTree = new MerkleTree(1n, recomputedItems);
  assert.strictEqual(recomputedTree.getRootHex(), snapshot.merkle_root);
  assert.strictEqual(recomputedTree.toJSON().meta_hash, snapshot.meta_hash);
});
