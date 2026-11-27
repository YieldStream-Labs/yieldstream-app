import { Pool } from "pg";

export function createPool(connectionString: string): Pool {
  if (!connectionString || connectionString.trim().length === 0) {
    throw new Error(
      "DATABASE_URL is required (set it to a Postgres connection string)"
    );
  }
  return new Pool({ connectionString });
}

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS distributions (
  distribution_id INTEGER PRIMARY KEY,
  creator TEXT NOT NULL DEFAULT '',
  token TEXT NOT NULL DEFAULT '',
  merkle_root TEXT NOT NULL,
  total_amount TEXT NOT NULL,
  claimed_amount TEXT NOT NULL DEFAULT '0',
  num_recipients INTEGER NOT NULL,
  claimed_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT '0',
  end_time TEXT NOT NULL DEFAULT '0',
  status INTEGER NOT NULL DEFAULT 0,
  start_time TEXT,
  cliff_time TEXT,
  vesting_end_time TEXT,
  clawback_time TEXT,
  snapshot_meta_hash TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leaves (
  distribution_id INTEGER NOT NULL REFERENCES distributions(distribution_id) ON DELETE CASCADE,
  leaf_index INTEGER NOT NULL,
  recipient TEXT NOT NULL,
  amount TEXT NOT NULL,
  leaf TEXT NOT NULL,
  proof JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (distribution_id, leaf_index)
);

CREATE INDEX IF NOT EXISTS leaves_recipient_idx ON leaves (LOWER(recipient));

CREATE TABLE IF NOT EXISTS claims (
  distribution_id INTEGER NOT NULL,
  leaf_index INTEGER NOT NULL,
  recipient TEXT NOT NULL,
  claimed_amount TEXT NOT NULL DEFAULT '0',
  fully_claimed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (distribution_id, leaf_index)
);

CREATE TABLE IF NOT EXISTS contract_events (
  event_id TEXT PRIMARY KEY,
  ledger INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  event_type TEXT NOT NULL,
  distribution_id INTEGER,
  topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ledger_closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contract_events_distribution_idx
  ON contract_events (distribution_id);

CREATE TABLE IF NOT EXISTS indexer_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

export async function initializeDatabase(pool: Pool): Promise<void> {
  await pool.query(SCHEMA_SQL);
}
