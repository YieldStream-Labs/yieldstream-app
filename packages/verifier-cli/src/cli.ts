#!/usr/bin/env node
import { verifyDistribution } from "./verify.js";

function parseArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        parsed[key] = next;
        i++;
      } else {
        parsed[key] = "true";
      }
    }
  }
  return parsed;
}

function printUsage() {
  console.log(`
YieldStream Verifier CLI - Public Dividend Tree Audit Tool

Usage:
  yieldstream-verifier --id <DISTRIBUTION_ID> --file <SNAPSHOT_JSON> [OPTIONS]

Required Options:
  --id <ID>                 Distribution ID to verify
  --file <PATH>             Path to the JSON distribution snapshot file

Network Options:
  --contract <ADDRESS>      Distributor contract ID (default: $NEXT_PUBLIC_DISTRIBUTOR_CONTRACT_ID)
  --rpc <URL>               Soroban RPC URL (default: $NEXT_PUBLIC_RPC_URL)
  --network-passphrase <STR> Network passphrase (default: $NEXT_PUBLIC_NETWORK_PASSPHRASE)
  --horizon <URL>           Horizon URL (default: $HORIZON_URL)

Exit Codes:
  0 - Match: On-chain root, leaf_count, and meta_hash match recomputed values.
  1 - Mismatch / Verification failure.
`);
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.help || flags.h || Object.keys(flags).length === 0) {
    printUsage();
    process.exit(flags.help || flags.h ? 0 : 1);
  }

  const distributionId = flags.id;
  if (!distributionId) {
    console.error("❌ Error: Missing required option --id");
    process.exit(1);
  }

  const snapshotFile = flags.file;
  if (!snapshotFile) {
    console.error("❌ Error: Missing required option --file");
    process.exit(1);
  }

  const contractId =
    flags.contract || process.env.NEXT_PUBLIC_DISTRIBUTOR_CONTRACT_ID;
  if (!contractId) {
    console.error("❌ Error: Missing contract ID (--contract or NEXT_PUBLIC_DISTRIBUTOR_CONTRACT_ID)");
    process.exit(1);
  }

  const rpcUrl =
    flags.rpc ||
    process.env.NEXT_PUBLIC_RPC_URL ||
    "https://soroban-testnet.stellar.org";
  const networkPassphrase =
    flags["network-passphrase"] ||
    process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ||
    "Test SDF Network ; September 2015";
  const horizonUrl =
    flags.horizon ||
    process.env.HORIZON_URL ||
    "https://horizon-testnet.stellar.org";

  console.log("======================================================================");
  console.log(`🔍 Auditing YieldStream Distribution #${distributionId}`);
  console.log(`Contract: ${contractId}`);
  console.log(`RPC:      ${rpcUrl}`);
  console.log(`File:     ${snapshotFile}`);
  console.log("======================================================================");

  try {
    const res = await verifyDistribution({
      distributionId: BigInt(distributionId),
      contractId,
      rpcUrl,
      networkPassphrase,
      horizonUrl,
      snapshotFile,
    });

    console.log("\nComparison Audit Results:");
    console.log(`• Merkle Root Match: ${res.checks.rootMatch ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`  On-Chain:    ${res.onChain.merkleRoot}`);
    console.log(`  Recomputed:  ${res.recomputed.merkleRoot}`);

    console.log(`\n• Leaf Count Match:  ${res.checks.leafCountMatch ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`  On-Chain:    ${res.onChain.leafCount}`);
    console.log(`  Recomputed:  ${res.recomputed.leafCount}`);

    if (res.onChain.metaHash) {
      console.log(`\n• Meta Hash Match:   ${res.checks.metaHashMatch ? "✅ PASS" : "❌ FAIL"}`);
      console.log(`  On-Chain:    ${res.onChain.metaHash}`);
      console.log(`  Recomputed:  ${res.recomputed.metaHash}`);
    }

    if (res.matched) {
      console.log("\n======================================================================");
      console.log("✅ AUDIT PASSED: On-chain distribution perfectly matches recomputed tree.");
      console.log("======================================================================");
      process.exit(0);
    } else {
      console.error("\n======================================================================");
      console.error("❌ AUDIT FAILED: Discrepancy detected between on-chain state and snapshot.");
      console.error("======================================================================");
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`\n❌ Execution error during audit: ${err?.message || err}`);
    process.exit(1);
  }
}

main();
