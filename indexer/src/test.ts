import test from "node:test";
import assert from "node:assert";
import { parseDecimalToBigInt, calculateDividend, calculateAllocations } from "./math.js";
import { Holder } from "./types.js";

test("parseDecimalToBigInt converts 7-decimal strings to stroops correctly without floats", () => {
  assert.strictEqual(parseDecimalToBigInt("0"), 0n);
  assert.strictEqual(parseDecimalToBigInt("1"), 10000000n);
  assert.strictEqual(parseDecimalToBigInt("100.5"), 1005000000n);
  assert.strictEqual(parseDecimalToBigInt("0.0000001"), 1n);
  assert.strictEqual(parseDecimalToBigInt("123456.7890123"), 1234567890123n);
});

test("calculateDividend floors integer division", () => {
  const pool = 100n;
  const balance = 33n;
  const sum = 100n;
  // 100 * 33 / 100 = 33
  assert.strictEqual(calculateDividend(pool, balance, sum), 33n);

  // 100 * 1 / 3 = 33 (floor(33.333...))
  assert.strictEqual(calculateDividend(100n, 1n, 3n), 33n);
});

test("calculateAllocations preserves pool boundary and creates sorted allocations", () => {
  const holders: Holder[] = [
    { address: "GBBB...", rawBalance: 2000n },
    { address: "GAAA...", rawBalance: 1000n },
    { address: "GCCC...", rawBalance: 0n }, // zero balance filtered
    { address: "GDDD...", rawBalance: 3000n },
  ];

  const pool = 60000n;
  const allocations = calculateAllocations(holders, pool);

  assert.strictEqual(allocations.length, 3);
  // GAAA (1000 / 6000 = 10000)
  assert.strictEqual(allocations[0].claimant, "GAAA...");
  assert.strictEqual(allocations[0].index, 0);
  assert.strictEqual(allocations[0].rewardAmount, 10000n);

  // GBBB (2000 / 6000 = 20000)
  assert.strictEqual(allocations[1].claimant, "GBBB...");
  assert.strictEqual(allocations[1].index, 1);
  assert.strictEqual(allocations[1].rewardAmount, 20000n);

  // GDDD (3000 / 6000 = 30000)
  assert.strictEqual(allocations[2].claimant, "GDDD...");
  assert.strictEqual(allocations[2].index, 2);
  assert.strictEqual(allocations[2].rewardAmount, 30000n);
});
