import test from "node:test";
import assert from "node:assert";
import { Keypair } from "@stellar/stellar-sdk";
import {
  u64ToBe,
  u32ToBe,
  i128ToBe,
  computeLeaf,
  hashPair,
  verifyProof,
} from "./hash.js";
import { MerkleTree, LeafItem } from "./tree.js";

test("i128ToBe serializes BigInt to exact 16-byte big-endian buffer", () => {
  const zero = i128ToBe(0n);
  assert.strictEqual(zero.length, 16);
  assert.strictEqual(zero.toString("hex"), "00000000000000000000000000000000");

  const val = i128ToBe(1000n);
  assert.strictEqual(val.length, 16);
  assert.strictEqual(val.toString("hex"), "000000000000000000000000000003e8");

  const large = i128ToBe(18446744073709551615n); // 2^64 - 1
  assert.strictEqual(large.toString("hex"), "0000000000000000ffffffffffffffff");
});

test("computeLeaf generates 32-byte leaf hash", () => {
  const key = Keypair.random();
  const leaf = computeLeaf(1n, 0, key.publicKey(), 1000n);
  assert.strictEqual(leaf.length, 32);
});

test("u64ToBe and u32ToBe big endian lengths", () => {
  const u64 = u64ToBe(1n);
  assert.strictEqual(u64.length, 8);
  assert.strictEqual(u64.toString("hex"), "0000000000000001");

  const u32 = u32ToBe(1);
  assert.strictEqual(u32.length, 4);
  assert.strictEqual(u32.toString("hex"), "00000001");
});

test("hashPair sorts buffers lexicographically", () => {
  const a = Buffer.alloc(32, 0x11);
  const b = Buffer.alloc(32, 0x22);

  const hash1 = hashPair(a, b);
  const hash2 = hashPair(b, a);

  // Sorting guarantees commutative hash
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

  // Verify all 4 proofs
  for (let i = 0; i < 4; i++) {
    const proof = tree.getProof(i);
    const leaf = tree.getLeaf(i);
    const isValid = verifyProof(proof, root, leaf);
    assert.strictEqual(isValid, true, `Proof for index ${i} should be valid`);
  }

  // Corrupted proof must fail
  const proof0 = tree.getProof(0);
  proof0[0] = Buffer.alloc(32, 0xff);
  const isInvalid = verifyProof(proof0, root, tree.getLeaf(0));
  assert.strictEqual(isInvalid, false);

  // Snapshot JSON serialization
  const snapshot = tree.toJSON();
  assert.strictEqual(snapshot.distribution_id, "1");
  assert.strictEqual(snapshot.leaf_count, 4);
  assert.strictEqual(snapshot.total_amount, "120000");
  assert.strictEqual(snapshot.leaves.length, 4);
  assert.ok(snapshot.meta_hash.length === 64);
});
