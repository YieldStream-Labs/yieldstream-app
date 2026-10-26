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

test("addressToScVal encodes valid Stellar public key to Address ScVal", () => {
  const kp = Keypair.random();
  const scVal = addressToScVal(kp.publicKey());
  assert.ok(scVal);
});

test("u64, u32, i128 and bytes32 ScVal conversions", () => {
  const u64Val = u64ToScVal(12345n);
  assert.ok(u64Val);

  const u32Val = u32ToScVal(42);
  assert.ok(u32Val);

  const i128Val = i128ToScVal(1_000_000n);
  assert.ok(i128Val);

  const b32 = bytes32ToScVal(Buffer.alloc(32, 0xaa));
  assert.ok(b32);

  const vec = vecBytes32ToScVal([Buffer.alloc(32, 0x11), Buffer.alloc(32, 0x22)]);
  assert.ok(vec);
});

test("YieldStreamClient instantiates with config", () => {
  const client = new YieldStreamClient({
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
  });
  assert.strictEqual(client.contractId, "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM");
});
