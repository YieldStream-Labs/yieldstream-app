import { Pool, PoolClient } from "pg";
import { DistributionSnapshotJSON } from "../../packages/merkle/dist/index.js";
import {
  DecodedContractEvent,
} from "../../packages/sdk/dist/index.js";
import { computeEligibility, EligibilityInput, EligibleStream } from "./eligibility.js";

export interface EventMetadata {
  eventId: string;
  ledger: number;
  txHash: string;
  ledgerClosedAt?: string;
  topics: unknown;
  payload: unknown;
}

export interface DistributionRow {
  distribution_id: number;
  creator: string;
  token: string;
  merkle_root: string;
  total_amount: string;
  claimed_amount: string;
  num_recipients: number;
  claimed_count: number;
  created_at: string;
  end_time: string;
  status: number;
  start_time: string | null;
  cliff_time: string | null;
  vesting_end_time: string | null;
  clawback_time: string | null;
  snapshot_meta_hash: string | null;
}

interface EligibilityRow extends DistributionRow {
  leaf_index: number;
  recipient: string;
  leaf_amount: string;
  leaf: string;
  proof: string[];
  leaf_claimed_amount: string | null;
  fully_claimed: boolean | null;
}

interface ClaimRow {
  claimed_amount: string;
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? item.toString(10) : item
  );
}

async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function upsertDistribution(
  client: PoolClient,
  values: {
    distributionId: number;
    creator: string;
    token: string;
    merkleRoot: string;
    totalAmount: string;
    numRecipients: number;
    createdAt: string;
    endTime: string;
    startTime?: string | null;
    cliffTime?: string | null;
    vestingEndTime?: string | null;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO distributions (
       distribution_id, creator, token, merkle_root, total_amount,
       num_recipients, created_at, end_time, start_time, cliff_time,
       vesting_end_time, status, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,NOW())
     ON CONFLICT (distribution_id) DO UPDATE SET
       creator = CASE WHEN EXCLUDED.creator = '' THEN distributions.creator ELSE EXCLUDED.creator END,
       token = CASE WHEN EXCLUDED.token = '' THEN distributions.token ELSE EXCLUDED.token END,
       merkle_root = EXCLUDED.merkle_root,
       total_amount = EXCLUDED.total_amount,
       num_recipients = CASE WHEN EXCLUDED.num_recipients = 0 THEN distributions.num_recipients ELSE EXCLUDED.num_recipients END,
       created_at = CASE WHEN EXCLUDED.created_at = '0' THEN distributions.created_at ELSE EXCLUDED.created_at END,
       end_time = EXCLUDED.end_time,
       start_time = COALESCE(EXCLUDED.start_time, distributions.start_time),
       cliff_time = COALESCE(EXCLUDED.cliff_time, distributions.cliff_time),
       vesting_end_time = COALESCE(EXCLUDED.vesting_end_time, distributions.vesting_end_time),
       updated_at = NOW()`,
    [
      values.distributionId,
      values.creator,
      values.token,
      values.merkleRoot,
      values.totalAmount,
      values.numRecipients,
      values.createdAt,
      values.endTime,
      values.startTime ?? null,
      values.cliffTime ?? null,
      values.vestingEndTime ?? null,
    ]
  );
}

function unixSeconds(isoTimestamp: string | undefined): string {
  if (!isoTimestamp) {
    return "0";
  }
  const millis = Date.parse(isoTimestamp);
  if (Number.isNaN(millis)) {
    return "0";
  }
  return Math.floor(millis / 1000).toString(10);
}

async function recordClaim(
  client: PoolClient,
  distributionId: number,
  index: number,
  recipient: string,
  amount: bigint
): Promise<void> {
  const existing = await client.query<ClaimRow>(
    `SELECT claimed_amount FROM claims
     WHERE distribution_id = $1 AND leaf_index = $2 FOR UPDATE`,
    [distributionId, index]
  );
  const previous = existing.rows.length > 0
    ? BigInt(existing.rows[0].claimed_amount)
    : 0n;
  const newClaimed = previous + amount;

  const leafResult = await client.query<{ amount: string }>(
    `SELECT amount FROM leaves WHERE distribution_id = $1 AND leaf_index = $2`,
    [distributionId, index]
  );
  const leafAmount = leafResult.rows.length > 0
    ? BigInt(leafResult.rows[0].amount)
    : null;

  const distributionResult = await client.query<{
    total_amount: string;
    claimed_amount: string;
    num_recipients: number;
    claimed_count: number;
    start_time: string | null;
    cliff_time: string | null;
    vesting_end_time: string | null;
    clawback_time: string | null;
  }>(
    `SELECT total_amount, claimed_amount, num_recipients, claimed_count,
            start_time, cliff_time, vesting_end_time, clawback_time
     FROM distributions WHERE distribution_id = $1 FOR UPDATE`,
    [distributionId]
  );
  const distribution = distributionResult.rows.length > 0
    ? distributionResult.rows[0]
    : null;

  let fullyClaimed = false;
  if (leafAmount !== null) {
    fullyClaimed = newClaimed >= leafAmount;
    if (
      !fullyClaimed &&
      distribution &&
      distribution.clawback_time &&
      distribution.start_time &&
      distribution.cliff_time &&
      distribution.vesting_end_time
    ) {
      const schedule = {
        startTime: BigInt(distribution.start_time),
        cliffTime: BigInt(distribution.cliff_time),
        endTime: BigInt(distribution.vesting_end_time),
      };
      const vestedAtClawback = vestedAmountAt(
        schedule,
        leafAmount,
        BigInt(distribution.clawback_time)
      );
      fullyClaimed = newClaimed >= vestedAtClawback;
    }
  }

  await client.query(
    `INSERT INTO claims (
       distribution_id, leaf_index, recipient, claimed_amount,
       fully_claimed, updated_at
     ) VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (distribution_id, leaf_index) DO UPDATE SET
       recipient = EXCLUDED.recipient,
       claimed_amount = EXCLUDED.claimed_amount,
       fully_claimed = EXCLUDED.fully_claimed,
       updated_at = NOW()`,
    [distributionId, index, recipient, newClaimed.toString(10), fullyClaimed]
  );

  if (distribution) {
    const total = BigInt(distribution.total_amount);
    const newDistributionClaimed = BigInt(distribution.claimed_amount) + amount;
    const claimedCountResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM claims
       WHERE distribution_id = $1 AND fully_claimed = TRUE`,
      [distributionId]
    );
    const claimedCount = Number(claimedCountResult.rows[0].count);
    const status =
      claimedCount >= distribution.num_recipients ||
      newDistributionClaimed >= total
        ? 2
        : 0;

    await client.query(
      `UPDATE distributions
       SET claimed_amount = $2,
           claimed_count = $3,
           status = CASE WHEN status = 4 THEN status ELSE $4 END,
           updated_at = NOW()
       WHERE distribution_id = $1`,
      [
        distributionId,
        newDistributionClaimed.toString(10),
        claimedCount,
        status,
      ]
    );
  }
}

function vestedAmountAt(
  schedule: { startTime: bigint; cliffTime: bigint; endTime: bigint },
  amount: bigint,
  timestamp: bigint
): bigint {
  if (amount <= 0n || timestamp < schedule.cliffTime) {
    return 0n;
  }
  if (timestamp >= schedule.endTime) {
    return amount;
  }
  const duration = schedule.endTime - schedule.startTime;
  if (duration <= 0n) {
    return amount;
  }
  const elapsed = timestamp > schedule.startTime
    ? timestamp - schedule.startTime
    : 0n;
  if (elapsed >= duration) {
    return amount;
  }
  return (amount * elapsed) / duration;
}

export async function applyDecodedEvent(
  pool: Pool,
  decoded: DecodedContractEvent,
  metadata: EventMetadata
): Promise<boolean> {
  return withTransaction(pool, async (client) => {
    const insertedEvent = await client.query(
      `INSERT INTO contract_events (
         event_id, ledger, tx_hash, event_type, distribution_id,
         topics, payload, ledger_closed_at
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [
        metadata.eventId,
        metadata.ledger,
        metadata.txHash,
        decoded.type,
        distributionIdOf(decoded),
        safeJson(metadata.topics ?? []),
        safeJson(metadata.payload ?? {}),
        metadata.ledgerClosedAt ?? null,
      ]
    );

    if (insertedEvent.rows.length === 0) {
      return false;
    }

    switch (decoded.type) {
      case "created": {
        const event = decoded.event;
        await upsertDistribution(client, {
          distributionId: event.distributionId,
          creator: event.creator,
          token: event.token,
          merkleRoot: event.merkleRoot,
          totalAmount: event.totalAmount.toString(10),
          numRecipients: 0,
          createdAt: unixSeconds(metadata.ledgerClosedAt),
          endTime: event.endTime.toString(10),
        });
        break;
      }
      case "stream": {
        const event = decoded.event;
        await upsertDistribution(client, {
          distributionId: event.distributionId,
          creator: event.issuer,
          token: event.token,
          merkleRoot: event.merkleRoot,
          totalAmount: event.totalAmount.toString(10),
          numRecipients: 0,
          createdAt: unixSeconds(metadata.ledgerClosedAt),
          endTime: "0",
          startTime: event.startTime.toString(10),
          cliffTime: event.cliffTime.toString(10),
          vestingEndTime: event.endTime.toString(10),
        });
        break;
      }
      case "claimed": {
        const event = decoded.event;
        await recordClaim(
          client,
          event.distributionId,
          event.index,
          event.recipient,
          event.amount
        );
        break;
      }
      case "clawback": {
        const event = decoded.event;
        await client.query(
          `UPDATE distributions
           SET status = 4, clawback_time = $2, updated_at = NOW()
           WHERE distribution_id = $1`,
          [event.distributionId, event.timestamp.toString(10)]
        );
        break;
      }
      case "cancel": {
        await client.query(
          `UPDATE distributions SET status = 1, updated_at = NOW()
           WHERE distribution_id = $1`,
          [decoded.event.distributionId]
        );
        break;
      }
      case "swept": {
        await client.query(
          `UPDATE distributions
           SET status = 2, claimed_amount = total_amount, updated_at = NOW()
           WHERE distribution_id = $1`,
          [decoded.event.distributionId]
        );
        break;
      }
      case "upgrade":
        break;
    }

    return true;
  });
}

function distributionIdOf(decoded: DecodedContractEvent): number | null {
  switch (decoded.type) {
    case "created":
    case "stream":
    case "claimed":
    case "clawback":
    case "cancel":
    case "swept":
      return decoded.event.distributionId;
    case "upgrade":
      return null;
  }
}

export interface SaveSnapshotOptions {
  creator?: string;
  token?: string;
  startTime?: string;
  cliffTime?: string;
  vestingEndTime?: string;
}

export async function saveSnapshot(
  pool: Pool,
  snapshot: DistributionSnapshotJSON,
  options: SaveSnapshotOptions = {}
): Promise<void> {
  const distributionId = Number(BigInt(snapshot.distribution_id));
  const vesting = snapshot.vesting_schedule;

  await withTransaction(pool, async (client) => {
    await upsertDistribution(client, {
      distributionId,
      creator: options.creator ?? "",
      token: options.token ?? "",
      merkleRoot: snapshot.merkle_root,
      totalAmount: snapshot.total_amount,
      numRecipients: snapshot.leaf_count,
      createdAt: "0",
      endTime: "0",
      startTime: options.startTime ?? vesting?.start_time ?? null,
      cliffTime: options.cliffTime ?? vesting?.cliff_time ?? null,
      vestingEndTime: options.vestingEndTime ?? vesting?.end_time ?? null,
    });

    await client.query(
      `UPDATE distributions
       SET merkle_root = $2, total_amount = $3, num_recipients = $4,
           snapshot_meta_hash = $5, updated_at = NOW()
       WHERE distribution_id = $1`,
      [
        distributionId,
        snapshot.merkle_root,
        snapshot.total_amount,
        snapshot.leaf_count,
        snapshot.meta_hash,
      ]
    );

    await client.query(
      `DELETE FROM leaves WHERE distribution_id = $1`,
      [distributionId]
    );

    const chunkSize = 100;
    for (let offset = 0; offset < snapshot.leaves.length; offset += chunkSize) {
      const chunk = snapshot.leaves.slice(offset, offset + chunkSize);
      const values: unknown[] = [];
      const placeholders: string[] = [];

      chunk.forEach((leaf, idx) => {
        const base = idx * 6;
        placeholders.push(
          `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6}::jsonb)`
        );
        values.push(
          distributionId,
          leaf.index,
          leaf.claimant,
          leaf.amount,
          leaf.leaf,
          safeJson(leaf.proof)
        );
      });

      await client.query(
        `INSERT INTO leaves (
           distribution_id, leaf_index, recipient, amount, leaf, proof
         ) VALUES ${placeholders.join(",")}`,
        values
      );
    }
  });
}

export async function getEventsCursor(pool: Pool): Promise<string | null> {
  const result = await pool.query<{ value: string }>(
    `SELECT value FROM indexer_state WHERE key = 'events_cursor'`
  );
  return result.rows.length > 0 ? result.rows[0].value : null;
}

export async function setEventsCursor(
  pool: Pool,
  cursor: string
): Promise<void> {
  await pool.query(
    `INSERT INTO indexer_state (key, value, updated_at)
     VALUES ('events_cursor', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [cursor]
  );
}

export async function getEligibleStreams(
  pool: Pool,
  recipient: string,
  now: bigint,
  onlyClaimable = true
): Promise<EligibleStream[]> {
  const result = await pool.query<EligibilityRow>(
    `SELECT d.*,
            l.leaf_index,
            l.recipient,
            l.amount AS leaf_amount,
            l.leaf,
            l.proof,
            c.claimed_amount AS leaf_claimed_amount,
            c.fully_claimed
     FROM leaves l
     JOIN distributions d ON d.distribution_id = l.distribution_id
     LEFT JOIN claims c
       ON c.distribution_id = l.distribution_id AND c.leaf_index = l.leaf_index
     WHERE LOWER(l.recipient) = LOWER($1)
     ORDER BY d.distribution_id ASC, l.leaf_index ASC`,
    [recipient]
  );

  const streams = result.rows.map((row) => {
    const schedule =
      row.start_time && row.cliff_time && row.vesting_end_time
        ? {
            startTime: BigInt(row.start_time),
            cliffTime: BigInt(row.cliff_time),
            endTime: BigInt(row.vesting_end_time),
          }
        : null;

    const input: EligibilityInput = {
      distributionId: row.distribution_id,
      creator: row.creator,
      token: row.token,
      merkleRoot: row.merkle_root,
      status: row.status,
      totalAmount: row.total_amount,
      claimedAmount: row.claimed_amount,
      numRecipients: row.num_recipients,
      claimedCount: row.claimed_count,
      distributionEndTime: row.end_time,
      clawbackTime: row.clawback_time,
      schedule,
      leafIndex: row.leaf_index,
      recipient: row.recipient,
      leafAmount: row.leaf_amount,
      leaf: row.leaf,
      proof: Array.isArray(row.proof) ? row.proof : [],
      leafClaimedAmount: row.leaf_claimed_amount ?? "0",
      fullyClaimed: row.fully_claimed ?? false,
    };

    return computeEligibility(input, now);
  });

  return onlyClaimable ? streams.filter((stream) => stream.isClaimable) : streams;
}

export async function getDistributionSummary(
  pool: Pool,
  distributionId: number
): Promise<DistributionRow | null> {
  const result = await pool.query<DistributionRow>(
    `SELECT * FROM distributions WHERE distribution_id = $1`,
    [distributionId]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

export async function listDistributions(
  pool: Pool,
  limit = 50
): Promise<DistributionRow[]> {
  const result = await pool.query<DistributionRow>(
    `SELECT * FROM distributions ORDER BY distribution_id DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}


