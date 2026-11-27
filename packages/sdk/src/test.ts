import test from "node:test";
import assert from "node:assert";
import { Keypair } from "@stellar/stellar-sdk";
import {
  addressToScVal,
  bytes32ToScVal,
  i128ToScVal,
  u32ToScVal,
  u64ToScVal,
  vecBytes32ToScVal,
} from "./xdr.js";
import { YieldStreamClient } from "./client.js";
import { claimableAmount, lockedAmount, vestedAmount } from "./vesting.js";

const CONTRACT_ID = "CDLZUEH5MJNV7FIZK33VYVYI3IKPNNJQNRRHNBFW5FMXY3U37PKS63PC";

test("addressToScVal encodes valid Stellar public key to Address ScVal", () => {
  const kp = Keypair.random();
  const scVal = addressToScVal(kp.publicKey());
  assert.ok(scVal);
});

test("u64, u32, i128 and bytes32 ScVal conversions", () => {
  assert.ok(u64ToScVal(12345n));
  assert.ok(u32ToScVal(42));
  assert.ok(i128ToScVal(1_000_000n));
  assert.ok(bytes32ToScVal(Buffer.alloc(32, 0xaa)));
  assert.ok(vecBytes32ToScVal([Buffer.alloc(32, 0x11), Buffer.alloc(32, 0x22)]));
  assert.throws(() => u32ToScVal(-1), /u32/);
});

test("YieldStreamClient instantiates with config", () => {
  const client = new YieldStreamClient({
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: CONTRACT_ID,
  });
  assert.strictEqual(client.contractId, CONTRACT_ID);
});

test("YieldStreamClient builds v2 transaction operations", () => {
  const key = Keypair.random();
  const client = new YieldStreamClient({
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: CONTRACT_ID,
  });
  const root = Buffer.alloc(32, 0x01);
  const proof = [Buffer.alloc(32, 0x02)];

  const op = client.buildCreateDistributionOp({
    creator: key.publicKey(),
    token: CONTRACT_ID,
    root,
    totalAmount: 1_000_000n,
    numRecipients: 4,
    endTime: 1_900_000_000n,
  });
  assert.ok(op);

  const streamOp = client.buildCreateStreamOp({
    issuer: key.publicKey(),
    token: CONTRACT_ID,
    root,
    totalAmount: 1_000_000n,
    numRecipients: 4,
    startTime: 1_800_000_000n,
    cliffTime: 1_800_086_400n,
    endTime: 1_900_000_000n,
  });
  assert.ok(streamOp);

  const claimOp = client.buildClaimOp({
    distributionId: 1,
    index: 0,
    recipient: key.publicKey(),
    amount: 250_000n,
    proof,
  });
  assert.ok(claimOp);

  assert.ok(client.buildCancelOp(1));
  assert.ok(client.buildSweepOp(1, key.publicKey()));
  assert.ok(client.buildClawbackOp(1));
});

test("vesting math matches the contract", () => {
  const schedule = {
    startTime: 1_000n,
    cliffTime: 2_000n,
    endTime: 11_000n,
  };
  const amount = 100_000n;

  assert.strictEqual(vestedAmount(schedule, amount, 1_999n), 0n);
  assert.strictEqual(vestedAmount(schedule, amount, 2_000n), 10_000n);
  assert.strictEqual(vestedAmount(schedule, amount, 6_000n), 50_000n);
  assert.strictEqual(vestedAmount(schedule, amount, 11_000n), amount);
  assert.strictEqual(vestedAmount(schedule, amount, 20_000n), amount);
});

test("claimable amount accounts for prior claims and clawback freeze", () => {
  const schedule = {
    startTime: 1_000n,
    cliffTime: 2_000n,
    endTime: 11_000n,
  };
  const amount = 100_000n;

  assert.strictEqual(
    claimableAmount({
      amount,
      alreadyClaimed: 0n,
      timestamp: 6_000n,
      schedule,
    }),
    50_000n
  );

  assert.strictEqual(
    claimableAmount({
      amount,
      alreadyClaimed: 30_000n,
      timestamp: 6_000n,
      schedule,
    }),
    20_000n
  );

  assert.strictEqual(
    claimableAmount({
      amount,
      alreadyClaimed: 50_000n,
      timestamp: 20_000n,
      schedule,
      clawbackTime: 6_000n,
    }),
    0n
  );

  assert.strictEqual(lockedAmount(schedule, amount, 6_000n), 50_000n);
  assert.strictEqual(lockedAmount(null, amount, 6_000n), 0n);
});
