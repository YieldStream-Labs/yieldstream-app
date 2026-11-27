import { createApiServer } from "./api.js";
import { createPool, initializeDatabase } from "./db.js";
import { runIngestionLoop } from "./ingest.js";

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
  const port = Number(process.env.PORT ?? "8787");
  const host = process.env.HOST ?? "0.0.0.0";
  const pollIntervalMs = Number(process.env.INDEXER_POLL_INTERVAL_MS ?? "5000");
  const startLedger = process.env.INDEXER_START_LEDGER
    ? Number(process.env.INDEXER_START_LEDGER)
    : undefined;

  const pool = createPool(databaseUrl);
  await initializeDatabase(pool);

  if (process.env.INDEXER_DISABLE_INGEST !== "true") {
    void runIngestionLoop(
      pool,
      { rpcUrl, contractId, startLedger },
      pollIntervalMs,
      (error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Indexer ingestion error: ${message}`);
      }
    );
  }

  const server = createApiServer(pool);
  server.listen(port, host, () => {
    console.log(`YieldStream indexer API listening on ${host}:${port}`);
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Indexer failed to start: ${message}`);
  process.exitCode = 1;
});
