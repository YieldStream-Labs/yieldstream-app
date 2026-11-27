import { createPool, initializeDatabase } from "./db.js";
import { runIngestionOnce } from "./ingest.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const contractId =
    process.env.INDEXER_CONTRACT_ID ||
    process.env.NEXT_PUBLIC_DISTRIBUTOR_CONTRACT_ID;
  if (!contractId) {
    throw new Error(
      "Missing INDEXER_CONTRACT_ID (or NEXT_PUBLIC_DISTRIBUTOR_CONTRACT_ID)"
    );
  }
  const rpcUrl =
    process.env.INDEXER_RPC_URL ||
    process.env.NEXT_PUBLIC_RPC_URL ||
    "https://soroban-testnet.stellar.org";
  const startLedger = process.env.INDEXER_START_LEDGER
    ? Number(process.env.INDEXER_START_LEDGER)
    : undefined;

  const pool = createPool(databaseUrl);
  try {
    await initializeDatabase(pool);
    const result = await runIngestionOnce(pool, {
      rpcUrl,
      contractId,
      startLedger,
    });
    console.log(
      `Indexed ${result.processedEvents} new events (cursor: ${result.lastCursor ?? "none"})`
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Ingestion failed: ${message}`);
  process.exitCode = 1;
});
