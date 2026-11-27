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

import { computeEligibility, EligibilityInput } from "./eligibility.js";

function sampleInput(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    distributionId: 1,
    creator: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    token: "CDLZUEH5MJNV7FIZK33VYVYI3IKPNNJQNRRHNBFW5FMXY3U37PKS63PC",
    merkleRoot: "00".repeat(32),
    status: 0,
    totalAmount: "100000",
    claimedAmount: "0",
    numRecipients: 1,
    claimedCount: 0,
    distributionEndTime: "0",
    clawbackTime: null,
    schedule: {
      startTime: 1000n,
      cliffTime: 2000n,
      endTime: 11000n,
    },
    leafIndex: 0,
    recipient: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    leafAmount: "100000",
    leaf: "11".repeat(32),
    proof: ["22".repeat(32)],
    leafClaimedAmount: "0",
    fullyClaimed: false,
    ...overrides,
  };
}

test("computeEligibility reports vested, claimable and locked amounts", () => {
  const result = computeEligibility(sampleInput(), 6000n);
  assert.strictEqual(result.vestedAmount, "50000");
  assert.strictEqual(result.claimableAmount, "50000");
  assert.strictEqual(result.lockedAmount, "50000");
  assert.strictEqual(result.isClaimable, true);
  assert.strictEqual(result.expired, false);
});

test("computeEligibility respects cliff and prior claims", () => {
  const beforeCliff = computeEligibility(sampleInput(), 1500n);
  assert.strictEqual(beforeCliff.vestedAmount, "0");
  assert.strictEqual(beforeCliff.claimableAmount, "0");
  assert.strictEqual(beforeCliff.isClaimable, false);

  const alreadyClaimed = computeEligibility(
    sampleInput({ leafClaimedAmount: "30000" }),
    6000n
  );
  assert.strictEqual(alreadyClaimed.claimableAmount, "20000");
});

test("computeEligibility freezes vesting at clawback time", () => {
  const result = computeEligibility(
    sampleInput({ status: 4, clawbackTime: "6000", leafClaimedAmount: "50000" }),
    20000n
  );
  assert.strictEqual(result.vestedAmount, "50000");
  assert.strictEqual(result.lockedAmount, "50000");
  assert.strictEqual(result.claimableAmount, "0");
  assert.strictEqual(result.isClaimable, false);
});

test("computeEligibility treats expired distributions as not claimable", () => {
  const result = computeEligibility(
    sampleInput({ schedule: null, distributionEndTime: "5000" }),
    6000n
  );
  assert.strictEqual(result.expired, true);
  assert.strictEqual(result.isClaimable, false);
});
