import test from "node:test";
import assert from "node:assert";
import { Keypair } from "@stellar/stellar-sdk";
import {
  u32ToXdr,
  i128ToXdr,
  computeLeaf,
  hashPair,
  verifyProof,
  bytes32FromHex,
} from "./hash.js";
import { MerkleTree, LeafItem, treeFromSnapshot } from "./tree.js";

test("u32ToXdr and i128ToXdr encode canonical Soroban ScVal bytes", () => {
  assert.strictEqual(u32ToXdr(1).toString("hex"), "0000000300000001");
  assert.strictEqual(i128ToXdr(1000n).toString("hex"), "0000000a000000000000000000000000000003e8");
  assert.throws(() => u32ToXdr(-1), /u32/);
  assert.throws(() => u32ToXdr(2n ** 32n), /u32/);
});

test("computeLeaf matches the v2 contract vector for distribution 1", () => {
  const leaf = computeLeaf(
    1n,
    0,
    "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMDR4",
    10_000n
  );
  assert.strictEqual(
    leaf.toString("hex"),
    "07058dcaa5755a264fa03e9f71fc3e370084b7468aa9e03bbf1672a538c8da23"
  );
});

test("computeLeaf generates 32-byte leaf hash", () => {
  const key = Keypair.random();
  const leaf = computeLeaf(1n, 0, key.publicKey(), 1000n);
  assert.strictEqual(leaf.length, 32);
});

test("hashPair sorts buffers lexicographically", () => {
  const a = Buffer.alloc(32, 0x11);
  const b = Buffer.alloc(32, 0x22);

  const hash1 = hashPair(a, b);
  const hash2 = hashPair(b, a);

  assert.strictEqual(hash1.toString("hex"), hash2.toString("hex"));
});

test("MerkleTree builds root and produces verifiable inclusion proofs", () => {
  const key1 = Keypair.random();
  const key2 = Keypair.random();
  const key3 = Keypair.random();
  const key4 = Keypair.random();

  const items: LeafItem[] = [
    { index: 0, claimant: key1.publicKey(), amount: 10_000n },
    { index: 1, claimant: key2.publicKey(), amount: 25_000n },
    { index: 2, claimant: key3.publicKey(), amount: 35_000n },
    { index: 3, claimant: key4.publicKey(), amount: 50_000n },
  ];

  const tree = new MerkleTree(1n, items);
  const root = tree.getRoot();
  assert.strictEqual(root.length, 32);

  for (let i = 0; i < 4; i++) {
    const proof = tree.getProof(i);
    const leaf = tree.getLeaf(i);
    assert.strictEqual(verifyProof(proof, root, leaf), true);
  }

  const proof0 = tree.getProof(0);
  proof0[0] = Buffer.alloc(32, 0xff);
  assert.strictEqual(verifyProof(proof0, root, tree.getLeaf(0)), false);

  const snapshot = tree.toJSON();
  assert.strictEqual(snapshot.distribution_id, "1");
  assert.strictEqual(snapshot.leaf_count, 4);
  assert.strictEqual(snapshot.total_amount, "120000");
  assert.strictEqual(snapshot.leaves.length, 4);
  assert.ok(snapshot.meta_hash.length === 64);
});

test("MerkleTree snapshot includes vesting schedule and round-trips", () => {
  const key = Keypair.random();
  const tree = new MerkleTree(
    7n,
    [{ index: 0, claimant: key.publicKey(), amount: 500n }],
    {
      vestingSchedule: {
        startTime: 1_000n,
        cliffTime: 2_000n,
        endTime: 3_000n,
      },
    }
  );

  const snapshot = tree.toJSON();
  assert.deepStrictEqual(snapshot.vesting_schedule, {
    start_time: "1000",
    cliff_time: "2000",
    end_time: "3000",
  });

  const restored = treeFromSnapshot(snapshot);
  assert.strictEqual(restored.getRootHex(), tree.getRootHex());
  assert.strictEqual(restored.toJSON().meta_hash, snapshot.meta_hash);
});

test("bytes32FromHex rejects malformed hashes", () => {
  assert.strictEqual(bytes32FromHex("0x" + "aa".repeat(32)).length, 32);
  assert.throws(() => bytes32FromHex("abcd"), /32-byte hex/);
});
