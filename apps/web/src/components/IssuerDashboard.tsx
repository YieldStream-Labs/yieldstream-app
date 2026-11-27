"use client";

import React, { useState } from "react";
import { useWallet } from "../context/WalletContext";
import { CONFIG, isIndexerConfigured } from "../config";
import { YieldStreamClient } from "@yieldstream/sdk";
import { DistributionSnapshotJSON } from "@yieldstream/merkle";
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Loader2,
  CalendarClock,
  Undo2,
  Send,
} from "lucide-react";
import { scValToNative, Transaction } from "@stellar/stellar-sdk";
import { publishSnapshot } from "../lib/indexer";
import {
  formatAmount,
  formatTimestamp,
  nowSeconds,
  parseWholeNumber,
  shortAddress,
} from "../lib/format";

type CreateMode = "distribution" | "stream";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readCreatedDistributionId(
  returnValue: unknown
): bigint | null {
  if (!returnValue) {
    return null;
  }
  try {
    const native = scValToNative(returnValue as Parameters<typeof scValToNative>[0]);
    if (
      typeof native === "bigint" ||
      typeof native === "number" ||
      typeof native === "string"
    ) {
      return BigInt(native);
    }
    return null;
  } catch {
    return null;
  }
}

export function IssuerDashboard() {
  const { isConnected, publicKey, connect, signTransaction } = useWallet();

  const [mode, setMode] = useState<CreateMode>("distribution");
  const [tokenAddress, setTokenAddress] = useState("");
  const [durationDays, setDurationDays] = useState("30");
  const [startDays, setStartDays] = useState("0");
  const [cliffDays, setCliffDays] = useState("0");
  const [endDays, setEndDays] = useState("30");
  const [snapshotData, setSnapshotData] = useState<DistributionSnapshotJSON | null>(null);
  const [fileName, setFileName] = useState<string>("");

  const [manageId, setManageId] = useState("");
  const [sweepTo, setSweepTo] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSuccess, setTxSuccess] = useState<string | null>(null);
  const [deployedDistId, setDeployedDistId] = useState<string | null>(null);
  const [publishNote, setPublishNote] = useState<string | null>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setTxSuccess(null);
    setPublishNote(null);
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      try {
        const parsed = JSON.parse(String(readerEvent.target?.result)) as DistributionSnapshotJSON;
        if (!parsed.merkle_root || !parsed.leaves || !Array.isArray(parsed.leaves)) {
          throw new Error("Invalid snapshot format: must include merkle_root and leaves array");
        }
        setSnapshotData(parsed);
      } catch (err: unknown) {
        setError(`JSON parse error: ${errorMessage(err)}`);
        setSnapshotData(null);
      }
    };
    reader.readAsText(file);
  };

  const handleCreateDistribution = async () => {
    if (!isConnected || !publicKey) {
      await connect();
      return;
    }

    if (!snapshotData) {
      setError("Please upload a valid snapshot JSON file first.");
      return;
    }

    if (!tokenAddress.trim()) {
      setError("Please provide a valid Stellar token address.");
      return;
    }

    setLoading(true);
    setError(null);
    setTxSuccess(null);
    setPublishNote(null);

    try {
      const client = new YieldStreamClient({
        rpcUrl: CONFIG.rpcUrl,
        networkPassphrase: CONFIG.networkPassphrase,
        contractId: CONFIG.contractId,
      });

      const now = nowSeconds();
      const root = Buffer.from(snapshotData.merkle_root.replace(/^0x/, ""), "hex");
      const totalAmount = BigInt(snapshotData.total_amount);

      let unsignedTx: Transaction;
      let scheduleMetadata: {
        startTime?: string;
        cliffTime?: string;
        vestingEndTime?: string;
      } = {};

      if (mode === "stream") {
        const startTime = now + parseWholeNumber(startDays, "Start days") * 86400n;
        const cliffTime = now + parseWholeNumber(cliffDays, "Cliff days") * 86400n;
        const endTime = now + parseWholeNumber(endDays, "End days") * 86400n;

        if (endTime <= startTime) {
          throw new Error("Vesting end must be after the start time.");
        }
        if (cliffTime < startTime || cliffTime > endTime) {
          throw new Error("Cliff must be between the start and end times.");
        }

        unsignedTx = await client.buildCreateStreamTx(
          {
            issuer: publicKey,
            token: tokenAddress.trim(),
            root,
            totalAmount,
            numRecipients: snapshotData.leaf_count,
            startTime,
            cliffTime,
            endTime,
          },
          publicKey
        );

        scheduleMetadata = {
          startTime: startTime.toString(10),
          cliffTime: cliffTime.toString(10),
          vestingEndTime: endTime.toString(10),
        };
      } else {
        const endTime = now + parseWholeNumber(durationDays, "Claim window days") * 86400n;
        if (endTime <= now) {
          throw new Error("Claim window must end in the future.");
        }

        unsignedTx = await client.buildCreateDistributionTx(
          {
            creator: publicKey,
            token: tokenAddress.trim(),
            root,
            totalAmount,
            numRecipients: snapshotData.leaf_count,
            endTime,
          },
          publicKey
        );
      }

      const signedXdr = await signTransaction(unsignedTx.toXDR());
      const signedTx = new Transaction(signedXdr, CONFIG.networkPassphrase);
      const result = await client.submitTransaction(signedTx);

      const createdId = readCreatedDistributionId(result.returnValue);
      const snapshotId = BigInt(snapshotData.distribution_id);
      const actualId = createdId ?? snapshotId;

      setTxSuccess(result.txHash);
      setDeployedDistId(actualId.toString(10));
      setManageId(actualId.toString(10));

      if (createdId !== null && createdId !== snapshotId) {
        setPublishNote(
          `On-chain distribution #${createdId.toString(10)} differs from snapshot #${snapshotId.toString(10)}. The snapshot was not published to the indexer because its proofs commit to a different ID.`
        );
        return;
      }

      if (isIndexerConfigured()) {
        try {
          await publishSnapshot(Number(actualId), snapshotData, {
            creator: publicKey,
            token: tokenAddress.trim(),
            ...scheduleMetadata,
          });
          setPublishNote("Snapshot published to the indexer; recipients can now discover their proofs.");
        } catch (publishError: unknown) {
          setPublishNote(
            `Distribution created, but the snapshot could not be published to the indexer: ${errorMessage(publishError)}`
          );
        }
      } else {
        setPublishNote(
          "Distribution created. Configure NEXT_PUBLIC_INDEXER_API_URL to publish snapshots automatically."
        );
      }
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleClawback = async () => {
    if (!isConnected || !publicKey) {
      await connect();
      return;
    }

    setActionLoading(true);
    setError(null);
    setActionMessage(null);

    try {
      const id = parseWholeNumber(manageId, "Distribution ID");
      const client = new YieldStreamClient({
        rpcUrl: CONFIG.rpcUrl,
        networkPassphrase: CONFIG.networkPassphrase,
        contractId: CONFIG.contractId,
      });
      const unsignedTx = await client.buildClawbackTx(id, publicKey);
      const signedXdr = await signTransaction(unsignedTx.toXDR());
      const signedTx = new Transaction(signedXdr, CONFIG.networkPassphrase);
      const result = await client.submitTransaction(signedTx);
      setActionMessage(`Clawback submitted successfully: ${result.txHash}`);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleSweep = async () => {
    if (!isConnected || !publicKey) {
      await connect();
      return;
    }

    if (!sweepTo.trim()) {
      setError("Please provide a destination address for the sweep.");
      return;
    }

    setActionLoading(true);
    setError(null);
    setActionMessage(null);

    try {
      const id = parseWholeNumber(manageId, "Distribution ID");
      const client = new YieldStreamClient({
        rpcUrl: CONFIG.rpcUrl,
        networkPassphrase: CONFIG.networkPassphrase,
        contractId: CONFIG.contractId,
      });
      const unsignedTx = await client.buildSweepTx(
        id,
        sweepTo.trim(),
        publicKey
      );
      const signedXdr = await signTransaction(unsignedTx.toXDR());
      const signedTx = new Transaction(signedXdr, CONFIG.networkPassphrase);
      const result = await client.submitTransaction(signedTx);
      setActionMessage(`Sweep submitted successfully: ${result.txHash}`);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const selectedSchedule = snapshotData?.vesting_schedule;

  return (
    <div className="max-w-5xl mx-auto py-10 px-4 sm:px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          Issuer Campaign Dashboard
        </h1>
        <p className="mt-2 text-slate-400">
          Fund fixed distributions or cliff-and-linear vesting streams, publish proofs to the indexer, and manage clawbacks.
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-sm text-rose-300">{error}</div>
        </div>
      )}

      {txSuccess && (
        <div className="mb-6 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5">
          <div className="flex items-center space-x-3 mb-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            <h3 className="font-semibold text-emerald-300 text-lg">
              Distribution Successfully Created
            </h3>
          </div>
          <p className="text-slate-300 text-sm">
            Distribution ID:{" "}
            <span className="font-mono text-cyan-300 font-bold">#{deployedDistId}</span>
          </p>
          <p className="text-slate-400 text-xs mt-1 font-mono break-all">
            Tx Hash: {txSuccess}
          </p>
          {publishNote && (
            <p className="text-xs text-cyan-300 mt-3">{publishNote}</p>
          )}
        </div>
      )}

      {actionMessage && (
        <div className="mb-6 bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4 text-sm text-cyan-200 font-mono break-all">
          {actionMessage}
        </div>
      )}

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-300">
              Create Campaign
            </h2>
            <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-1">
              <button
                onClick={() => setMode("distribution")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                  mode === "distribution"
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Fixed Distribution
              </button>
              <button
                onClick={() => setMode("stream")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                  mode === "stream"
                    ? "bg-cyan-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Cliff / Linear Stream
              </button>
            </div>
          </div>

          <label className="block text-sm font-semibold text-slate-300 mb-2">
            1. Upload Distribution Snapshot JSON
          </label>
          <div className="border-2 border-dashed border-slate-700 hover:border-slate-500 rounded-xl p-6 text-center cursor-pointer transition bg-slate-950/40 relative">
            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <UploadCloud className="w-10 h-10 text-cyan-400 mx-auto mb-2" />
            <span className="text-sm text-slate-200 font-medium">
              {fileName ? fileName : "Click to select a Merkle snapshot JSON"}
            </span>
            <p className="text-xs text-slate-500 mt-1">
              Supports snapshots produced by @yieldstream/indexer or @yieldstream/merkle
            </p>
          </div>
        </div>

        {snapshotData && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono space-y-2">
            <div className="flex justify-between border-b border-slate-800 pb-2">
              <span className="text-slate-400">Snapshot Distribution ID:</span>
              <span className="text-cyan-400 font-bold">#{snapshotData.distribution_id}</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 pb-2">
              <span className="text-slate-400">Total Recipients:</span>
              <span className="text-white">{snapshotData.leaf_count.toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 pb-2">
              <span className="text-slate-400">Total Token Amount:</span>
              <span className="text-emerald-400 font-bold">{formatAmount(snapshotData.total_amount)} units</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 pb-2">
              <span className="text-slate-400">Merkle Root:</span>
              <span className="text-slate-300 truncate max-w-[320px]">{snapshotData.merkle_root}</span>
            </div>
            {selectedSchedule && (
              <div className="flex justify-between">
                <span className="text-slate-400">Snapshot Vesting:</span>
                <span className="text-slate-300">
                  {formatTimestamp(selectedSchedule.start_time)} → {formatTimestamp(selectedSchedule.end_time)}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-1">
              2. SAC Token Contract Address
            </label>
            <input
              type="text"
              placeholder="e.g. CDLZUEH5MJNV7FIZK33VYVYI3IKPNNJQNRRHNBFW5FMXY3U37PKS63PC"
              value={tokenAddress}
              onChange={(event) => setTokenAddress(event.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              The token must be a deployed Stellar Asset Contract (SAC).
            </p>
          </div>

          {mode === "distribution" ? (
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-1">
                Claim Window Duration (Days)
              </label>
              <input
                type="number"
                min="1"
                max="3650"
                value={durationDays}
                onChange={(event) => setDurationDays(event.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-1">
                Start (Days From Now)
              </label>
              <input
                type="number"
                min="0"
                value={startDays}
                onChange={(event) => setStartDays(event.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          )}
        </div>

        {mode === "stream" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-1">
                Cliff (Days From Now)
              </label>
              <input
                type="number"
                min="0"
                value={cliffDays}
                onChange={(event) => setCliffDays(event.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-1">
                Fully Vested At (Days From Now)
              </label>
              <input
                type="number"
                min="1"
                value={endDays}
                onChange={(event) => setEndDays(event.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          </div>
        )}

        <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 flex items-start space-x-2">
          <CalendarClock className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <p>
            {mode === "distribution"
              ? "Claims are unlocked immediately and close when the claim window expires."
              : "Nothing is claimable before the cliff. After the cliff, each claim releases only the linearly vested portion, and the remainder stays locked."}
          </p>
        </div>

        <button
          onClick={handleCreateDistribution}
          disabled={loading || !snapshotData}
          className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50 text-white font-semibold flex items-center justify-center space-x-2 shadow-lg shadow-blue-500/20 transition transform active:scale-[0.99]"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Simulating & Submitting Transaction...</span>
            </>
          ) : (
            <>
              <span>
                {isConnected
                  ? mode === "stream"
                    ? "Create & Fund Vesting Stream"
                    : "Create & Fund Distribution"
                  : "Connect Wallet to Create"}
              </span>
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>

      <div className="mt-8 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
        <div>
          <h2 className="text-lg font-bold text-white">Manage Existing Stream</h2>
          <p className="text-sm text-slate-400 mt-1">
            Issuer-only clawback returns unvested tokens while leaving already-vested balances claimable. Sweep recovers remaining tokens after expiry or cancellation.
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-1">
            Distribution ID
          </label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="e.g. 1"
            value={manageId}
            onChange={(event) => setManageId(event.target.value)}
            className="w-full md:w-56 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center space-x-2">
              <Undo2 className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-slate-200">Clawback Unvested Tokens</h3>
            </div>
            <p className="text-xs text-slate-500">
              Available for vesting streams only. Vesting is frozen at the current ledger time.
            </p>
            <button
              onClick={handleClawback}
              disabled={actionLoading || !manageId.trim()}
              className="w-full py-2.5 rounded-lg bg-amber-600/80 hover:bg-amber-500 disabled:opacity-40 text-white text-sm font-semibold transition"
            >
              {actionLoading ? "Submitting..." : "Clawback Unvested"}
            </button>
          </div>

          <div className="border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center space-x-2">
              <Send className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-200">Sweep Remaining Tokens</h3>
            </div>
            <input
              type="text"
              placeholder="Destination G... or C... address"
              value={sweepTo}
              onChange={(event) => setSweepTo(event.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
            />
            <button
              onClick={handleSweep}
              disabled={actionLoading || !manageId.trim() || !sweepTo.trim()}
              className="w-full py-2.5 rounded-lg bg-cyan-700/80 hover:bg-cyan-600 disabled:opacity-40 text-white text-sm font-semibold transition"
            >
              {actionLoading ? "Submitting..." : "Sweep to Destination"}
            </button>
          </div>
        </div>

        {publicKey && (
          <p className="text-[11px] text-slate-500 font-mono">
            Issuer: {shortAddress(publicKey)} · Contract: {shortAddress(CONFIG.contractId)}
          </p>
        )}
      </div>
    </div>
  );
}
