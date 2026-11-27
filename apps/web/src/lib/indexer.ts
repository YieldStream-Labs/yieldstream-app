import { CONFIG, isIndexerConfigured } from "../config";
import { DistributionSnapshotJSON } from "@yieldstream/merkle";

export interface EligibleStream {
  distributionId: number;
  creator: string;
  token: string;
  merkleRoot: string;
  status: number;
  totalAmount: string;
  distributionEndTime: string;
  clawbackTime: string | null;
  schedule: {
    startTime: string;
    cliffTime: string;
    endTime: string;
  } | null;
  leaf: {
    index: number;
    recipient: string;
    amount: string;
    leaf: string;
    proof: string[];
  };
  claimedAmount: string;
  vestedAmount: string;
  claimableAmount: string;
  lockedAmount: string;
  fullyClaimed: boolean;
  expired: boolean;
  isClaimable: boolean;
}

interface AllocationResponse {
  recipient: string;
  asOf: string;
  streams: EligibleStream[];
}

function baseUrl(): string {
  if (!isIndexerConfigured()) {
    throw new Error(
      "Indexer API URL is not configured. Set NEXT_PUBLIC_INDEXER_API_URL."
    );
  }
  return CONFIG.indexerApiUrl;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Indexer returned a non-JSON response (${response.status})`);
  }
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Indexer request failed with status ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export async function fetchAllocationStreams(
  recipient: string,
  asOf?: bigint
): Promise<EligibleStream[]> {
  const params = asOf ? `?now=${asOf.toString(10)}` : "";
  const response = await fetch(
    `${baseUrl()}/recipients/${encodeURIComponent(recipient)}/allocations${params}`,
    { cache: "no-store" }
  );
  const body = await parseResponse<AllocationResponse>(response);
  return body.streams ?? [];
}

export async function fetchEligibleStreams(
  recipient: string,
  asOf?: bigint
): Promise<EligibleStream[]> {
  const params = asOf ? `?now=${asOf.toString(10)}` : "";
  const response = await fetch(
    `${baseUrl()}/recipients/${encodeURIComponent(recipient)}/eligible${params}`,
    { cache: "no-store" }
  );
  const body = await parseResponse<AllocationResponse>(response);
  return body.streams ?? [];
}

export interface PublishSnapshotOptions {
  creator: string;
  token: string;
  startTime?: string;
  cliffTime?: string;
  vestingEndTime?: string;
}

export async function publishSnapshot(
  distributionId: number,
  snapshot: DistributionSnapshotJSON,
  options: PublishSnapshotOptions
): Promise<void> {
  const response = await fetch(
    `${baseUrl()}/distributions/${distributionId}/snapshot`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        snapshot,
        creator: options.creator,
        token: options.token,
        startTime: options.startTime,
        cliffTime: options.cliffTime,
        vestingEndTime: options.vestingEndTime,
      }),
    }
  );
  await parseResponse<{ ok: boolean }>(response);
}
