import { rpc, scValToNative } from "@stellar/stellar-sdk";
import { Pool } from "pg";
import { decodeContractEvent } from "../../packages/sdk/dist/index.js";
import {
  applyDecodedEvent,
  getEventsCursor,
  setEventsCursor,
} from "./store.js";

export interface IngestionConfig {
  rpcUrl: string;
  contractId: string;
  startLedger?: number;
  pageSize?: number;
  maxPages?: number;
}

export interface IngestionResult {
  processedEvents: number;
  lastCursor: string | null;
}

function toNativeJson(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString(10);
  }
  if (Array.isArray(value)) {
    return value.map(toNativeJson);
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = toNativeJson(item);
    }
    return result;
  }
  return value;
}

function decodeTopics(topics: rpc.Api.EventResponse["topic"]): unknown[] {
  return topics.map((topic) => toNativeJson(scValToNative(topic)));
}

/**
 * Polls Soroban RPC getEvents and persists v2 contract events to Postgres.
 * Idempotent: event IDs are stored as primary keys.
 */
export async function runIngestionOnce(
  pool: Pool,
  config: IngestionConfig
): Promise<IngestionResult> {
  const server = new rpc.Server(config.rpcUrl);
  const pageSize = config.pageSize ?? 200;
  const maxPages = config.maxPages ?? 25;

  let cursor = await getEventsCursor(pool);
  let startLedger = config.startLedger;

  if (!cursor && startLedger === undefined) {
    const latest = await server.getLatestLedger();
    startLedger = Math.max(1, latest.sequence - 1000);
  }

  let processedEvents = 0;
  let request = {
    filters: [{ type: "contract" as const, contractIds: [config.contractId] }],
    limit: pageSize,
    ...(cursor ? { cursor } : { startLedger }),
  };

  for (let page = 0; page < maxPages; page++) {
    const response = await server.getEvents(request);

    for (const event of response.events) {
      const decoded = decodeContractEvent(event.topic, event.value);
      if (!decoded) {
        continue;
      }

      const applied = await applyDecodedEvent(pool, decoded, {
        eventId: event.id,
        ledger: event.ledger,
        txHash: event.txHash,
        ledgerClosedAt: event.ledgerClosedAt,
        topics: decodeTopics(event.topic),
        payload: toNativeJson(scValToNative(event.value)),
      });

      if (applied) {
        processedEvents++;
      }
    }

    cursor = response.cursor;
    if (cursor) {
      await setEventsCursor(pool, cursor);
    }

    if (response.events.length < pageSize || !response.cursor) {
      break;
    }

    request = {
      filters: [{ type: "contract" as const, contractIds: [config.contractId] }],
      limit: pageSize,
      cursor: response.cursor,
    };
  }

  return { processedEvents, lastCursor: cursor };
}

/**
 * Runs the ingestion loop forever, sleeping between polls.
 */
export async function runIngestionLoop(
  pool: Pool,
  config: IngestionConfig,
  intervalMs: number,
  onError: (error: unknown) => void
): Promise<never> {
  for (;;) {
    try {
      await runIngestionOnce(pool, config);
    } catch (error) {
      onError(error);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
