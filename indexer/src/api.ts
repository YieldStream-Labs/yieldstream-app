import http from "http";
import { Pool } from "pg";
import { DistributionSnapshotJSON } from "../../packages/merkle/dist/index.js";
import { saveSnapshot, getEligibleStreams, getDistributionSummary, listDistributions } from "./store.js";

const MAX_BODY_BYTES = 20 * 1024 * 1024;

interface JsonBody {
  snapshot?: DistributionSnapshotJSON;
  creator?: string;
  token?: string;
  startTime?: string;
  cliffTime?: string;
  vestingEndTime?: string;
}

function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString(10) : value;
}

function sendJson(
  response: http.ServerResponse,
  status: number,
  body: unknown
): void {
  const payload = JSON.stringify(body, jsonReplacer);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(payload);
}

function sendError(
  response: http.ServerResponse,
  status: number,
  message: string
): void {
  sendJson(response, status, { error: message });
}

async function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("Request body exceeds the maximum allowed size");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

function isSnapshot(value: unknown): value is DistributionSnapshotJSON {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.distribution_id === "string" &&
    typeof candidate.merkle_root === "string" &&
    typeof candidate.total_amount === "string" &&
    Array.isArray(candidate.leaves)
  );
}

export function createApiServer(pool: Pool): http.Server {
  return http.createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      response.end();
      return;
    }

    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", "http://api.internal");
    const pathname = url.pathname;
    const nowParam = url.searchParams.get("now");
    const now = nowParam
      ? BigInt(nowParam)
      : BigInt(Math.floor(Date.now() / 1000));

    try {
      if (method === "GET" && pathname === "/health") {
        sendJson(response, 200, { status: "ok" });
        return;
      }

      if (method === "GET" && pathname === "/distributions") {
        const limitParam = url.searchParams.get("limit");
        const limit = limitParam ? Number(limitParam) : 50;
        const distributions = await listDistributions(pool, limit);
        sendJson(response, 200, { distributions });
        return;
      }

      const distributionMatch = pathname.match(/^\/distributions\/(\d+)$/);
      if (method === "GET" && distributionMatch) {
        const distributionId = Number(distributionMatch[1]);
        const distribution = await getDistributionSummary(pool, distributionId);
        if (!distribution) {
          sendError(response, 404, `Distribution ${distributionId} not found`);
          return;
        }
        sendJson(response, 200, { distribution });
        return;
      }

      const recipientMatch = pathname.match(
        /^\/recipients\/([^/]+)\/(eligible|allocations)$/
      );
      if (method === "GET" && recipientMatch) {
        const recipient = decodeURIComponent(recipientMatch[1]);
        const onlyClaimable = recipientMatch[2] === "eligible";
        const streams = await getEligibleStreams(
          pool,
          recipient,
          now,
          onlyClaimable
        );
        sendJson(response, 200, {
          recipient,
          asOf: now.toString(10),
          streams,
        });
        return;
      }

      const snapshotMatch = pathname.match(
        /^\/distributions\/(\d+)\/snapshot$/
      );
      if (method === "POST" && snapshotMatch) {
        const distributionId = Number(snapshotMatch[1]);
        const body = (await readJsonBody(request)) as JsonBody;
        const snapshot = isSnapshot(body.snapshot) ? body.snapshot : body;
        if (!isSnapshot(snapshot)) {
          sendError(response, 400, "Request body must contain a distribution snapshot");
          return;
        }
        if (Number(BigInt(snapshot.distribution_id)) !== distributionId) {
          sendError(
            response,
            400,
            `Snapshot distribution_id ${snapshot.distribution_id} does not match URL ${distributionId}`
          );
          return;
        }
        await saveSnapshot(pool, snapshot, {
          creator: body.creator,
          token: body.token,
          startTime: body.startTime,
          cliffTime: body.cliffTime,
          vestingEndTime: body.vestingEndTime,
        });
        sendJson(response, 200, {
          ok: true,
          distributionId,
          leaves: snapshot.leaf_count,
        });
        return;
      }

      sendError(response, 404, `No route for ${method} ${pathname}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendError(response, 500, message);
    }
  });
}

export function startApiServer(
  pool: Pool,
  port: number,
  host: string
): http.Server {
  const server = createApiServer(pool);
  server.listen(port, host, () => {
    console.log(`YieldStream indexer API listening on ${host}:${port}`);
  });
  return server;
}
