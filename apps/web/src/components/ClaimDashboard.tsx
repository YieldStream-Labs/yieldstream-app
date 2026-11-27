"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { CONFIG, isIndexerConfigured } from "../config";
import { YieldStreamClient } from "@yieldstream/sdk";
import { DistributionSnapshotJSON, LeafSnapshot, verifyProof } from "@yieldstream/merkle";
import {
  claimableAmount as computeClaimableAmount,
  lockedAmount as computeLockedAmount,
  vestedAmount as computeVestedAmount,
  VestingSchedule,
} from "@yieldstream/sdk";
import {
  Wallet,
  CheckCircle,
  AlertCircle,
  ShieldCheck,
  Coins,
  ArrowRight,
  Loader2,
  Upload,
  RefreshCw,
  Lock,
  Unlock,
} from "lucide-react";
import { Transaction } from "@stellar/stellar-sdk";
import {
  EligibleStream,
  fetchAllocationStreams,
} from "../lib/indexer";
import {
  formatAmount,
  formatTimestamp,
  nowSeconds,
  shortAddress,
  statusLabel,
} from "../lib/format";

function allocationKey(allocation: EligibleStream): string {
  return `${allocation.distributionId}:${allocation.leaf.index}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function snapshotToAllocation(
  snapshot: DistributionSnapshotJSON,
  leaf: LeafSnapshot
): EligibleStream {
  const schedule: VestingSchedule | null = snapshot.vesting_schedule
    ? {
        startTime: BigInt(snapshot.vesting_schedule.start_time),
        cliffTime: BigInt(snapshot.vesting_schedule.cliff_time),
        endTime: BigInt(snapshot.vesting_schedule.end_time),
      }
    : null;
  const amount = BigInt(leaf.amount);
  const timestamp = nowSeconds();
  const vestedAmount = schedule
    ? computeVestedAmount(schedule, amount, timestamp)
    : amount;
  const claimable = computeClaimableAmount({
    amount,
    alreadyClaimed: 0n,
    timestamp,
    schedule,
  });
  const locked = computeLockedAmount(schedule, amount, timestamp);

  return {
    distributionId: Number(BigInt(snapshot.distribution_id)),
    creator: "",
    token: "",
    merkleRoot: snapshot.merkle_root,
    status: 0,
    totalAmount: snapshot.total_amount,
    distributionEndTime: "0",
    clawbackTime: null,
    schedule: schedule
      ? {
          startTime: schedule.startTime.toString(10),
          cliffTime: schedule.cliffTime.toString(10),
          endTime: schedule.endTime.toString(10),
        }
      : null,
    leaf: {
      index: leaf.index,
      recipient: leaf.claimant,
      amount: leaf.amount,
      leaf: leaf.leaf,
      proof: leaf.proof,
    },
    claimedAmount: "0",
    vestedAmount: vestedAmount.toString(10),
    claimableAmount: claimable.toString(10),
    lockedAmount: locked.toString(10),
    fullyClaimed: false,
    expired: false,
    isClaimable: claimable > 0n,
  };
}

export function ClaimDashboard() {
  const { isConnected, publicKey, connect, signTransaction } = useWallet();

  const [allocations, setAllocations] = useState<EligibleStream[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [snapshotData, setSnapshotData] = useState<DistributionSnapshotJSON | null>(null);

  const [loadingAllocations, setLoadingAllocations] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifiedOnChain, setVerifiedOnChain] = useState<boolean | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimSuccessTx, setClaimSuccessTx] = useState<string | null>(null);
  const [claimedAmount, setClaimedAmount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => allocations.find((allocation) => allocationKey(allocation) === selectedKey) ?? null,
    [allocations, selectedKey]
  );

  const loadAllocations = useCallback(async () => {
    if (!publicKey || !isIndexerConfigured()) {
      return;
    }
    setLoadingAllocations(true);
    setError(null);
    try {
      const streams = await fetchAllocationStreams(publicKey, nowSeconds());
      setAllocations(streams);
      setSelectedKey((current) => {
        if (streams.some((stream) => allocationKey(stream) === current)) {
          return current;
        }
        const firstClaimable = streams.find((stream) => stream.isClaimable) ?? streams[0];
        return firstClaimable ? allocationKey(firstClaimable) : "";
      });
    } catch (err: unknown) {
      setError(`Could not load allocations from the indexer: ${errorMessage(err)}`);
    } finally {
      setLoadingAllocations(false);
    }
  }, [publicKey]);

  useEffect(() => {
    if (!publicKey) {
      setAllocations([]);
      setSelectedKey("");
      return;
    }
    void loadAllocations();
  }, [publicKey, loadAllocations]);

  useEffect(() => {
    setVerifiedOnChain(null);
  }, [selectedKey]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setClaimSuccessTx(null);
    setClaimedAmount(null);
    setVerifiedOnChain(null);
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      try {
        const parsed = JSON.parse(String(readerEvent.target?.result)) as DistributionSnapshotJSON;
        if (!parsed.merkle_root || !Array.isArray(parsed.leaves)) {
          throw new Error("Invalid snapshot format: must include merkle_root and leaves");
        }
        setSnapshotData(parsed);
        if (!publicKey) {
          return;
        }
        const match = parsed.leaves.find(
          (leaf) => leaf.claimant.toLowerCase() === publicKey.toLowerCase()
        );
        if (!match) {
          setError("Connected wallet is not included in this snapshot.");
          return;
        }

        const root = Buffer.from(parsed.merkle_root.replace(/^0x/, ""), "hex");
        const leaf = Buffer.from(match.leaf.replace(/^0x/, ""), "hex");
        const proof = match.proof.map((item) => Buffer.from(item.replace(/^0x/, ""), "hex"));
        if (!verifyProof(proof, root, leaf)) {
          throw new Error("Local Merkle proof verification failed for this allocation.");
        }

        const allocation = snapshotToAllocation(parsed, match);
        setAllocations([allocation]);
        setSelectedKey(allocationKey(allocation));
      } catch (err: unknown) {
        setError(`Failed to parse snapshot JSON: ${errorMessage(err)}`);
      }
    };
    reader.readAsText(file);
  };

  const handleVerifyOnChain = async () => {
    if (!selected || !publicKey) return;

    setVerifying(true);
    setError(null);

    try {
      const client = new YieldStreamClient({
        rpcUrl: CONFIG.rpcUrl,
        networkPassphrase: CONFIG.networkPassphrase,
        contractId: CONFIG.contractId,
      });

      const isValid = await client.verify({
        distributionId: selected.distributionId,
        index: selected.leaf.index,
        recipient: publicKey,
        amount: BigInt(selected.leaf.amount),
        proof: selected.leaf.proof,
      });

      setVerifiedOnChain(isValid);
      if (!isValid) {
        setError("On-chain verification simulation returned false. Root or allocation mismatch.");
      }
    } catch (err: unknown) {
      setError(`On-chain verification error: ${errorMessage(err)}`);
      setVerifiedOnChain(false);
    } finally {
      setVerifying(false);
    }
  };

  const handleExecuteClaim = async () => {
    if (!isConnected || !publicKey) {
      await connect();
      return;
    }

    if (!selected) {
      setError("No claimable allocation found for the connected wallet.");
      return;
    }

    if (!selected.isClaimable) {
      setError("This allocation has nothing claimable right now. Wait for more vesting or check its status.");
      return;
    }

    setClaiming(true);
    setError(null);
    setClaimSuccessTx(null);
    setClaimedAmount(null);

    try {
      const client = new YieldStreamClient({
        rpcUrl: CONFIG.rpcUrl,
        networkPassphrase: CONFIG.networkPassphrase,
        contractId: CONFIG.contractId,
      });

      const unsignedTx = await client.buildClaimTx(
        {
          distributionId: selected.distributionId,
          index: selected.leaf.index,
          recipient: publicKey,
          amount: BigInt(selected.leaf.amount),
          proof: selected.leaf.proof,
        },
        publicKey
      );

      const signedXdr = await signTransaction(unsignedTx.toXDR());
      const signedTx = new Transaction(signedXdr, CONFIG.networkPassphrase);

      const result = await client.submitTransaction(signedTx);
      setClaimSuccessTx(result.txHash);
      setClaimedAmount(selected.claimableAmount);
      await loadAllocations();
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-10 px-4 sm:px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          Claim Vesting Allocations
        </h1>
        <p className="mt-2 text-slate-400">
          Connect your Freighter wallet to discover streams indexed by recipient. Claimable balances are fetched from the indexer and verified on-chain before claiming.
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-sm text-rose-300">{error}</div>
        </div>
      )}

      {claimSuccessTx && (
        <div className="mb-6 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5">
          <div className="flex items-center space-x-3 mb-2">
            <CheckCircle className="w-6 h-6 text-emerald-400" />
            <h3 className="font-semibold text-emerald-300 text-lg">
              Claim Submitted Successfully
            </h3>
          </div>
          <p className="text-slate-300 text-sm">
            Claimed{" "}
            <span className="font-bold text-white font-mono">
              {claimedAmount ? formatAmount(claimedAmount) : "vested"} units
            </span>{" "}
            to <span className="font-mono text-cyan-300">{publicKey}</span>
          </p>
          <p className="text-slate-400 text-xs mt-1 font-mono break-all">
            Tx Hash: {claimSuccessTx}
          </p>
        </div>
      )}

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
        <div className="flex items-center justify-between pb-6 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-slate-300">1. Wallet Connection</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {isConnected && publicKey
                ? `Connected: ${publicKey}`
                : "Connect your Freighter wallet to claim"}
            </p>
          </div>
          {isConnected && publicKey ? (
            <div className="flex items-center space-x-2 text-xs font-mono text-emerald-400 bg-emerald-500/10 py-1.5 px-3 rounded-lg border border-emerald-500/20">
              <CheckCircle className="w-4 h-4" />
              <span>Ready</span>
            </div>
          ) : (
            <button
              onClick={connect}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-2 px-4 rounded-xl shadow transition"
            >
              <Wallet className="w-4 h-4" />
              <span>Connect Wallet</span>
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-300">
                2. Indexed Allocations
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {isIndexerConfigured()
                  ? "Streams matched to your wallet by the YieldStream indexer."
                  : "Set NEXT_PUBLIC_INDEXER_API_URL to auto-discover allocations, or upload a snapshot below."}
              </p>
            </div>
            {isIndexerConfigured() && publicKey && (
              <button
                onClick={() => void loadAllocations()}
                disabled={loadingAllocations}
                className="flex items-center space-x-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 py-1.5 px-3 rounded-lg border border-cyan-500/30 hover:bg-cyan-500/10 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingAllocations ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>
            )}
          </div>

          {allocations.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {allocations.map((allocation) => {
                const key = allocationKey(allocation);
                const active = key === selectedKey;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedKey(key)}
                    className={`text-left rounded-xl border p-4 transition ${
                      active
                        ? "border-cyan-500/60 bg-cyan-500/10"
                        : "border-slate-800 bg-slate-950/40 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white font-mono">
                        Stream #{allocation.distributionId}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                        {statusLabel(allocation.status)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500 font-mono">
                      Leaf #{allocation.leaf.index} · {shortAddress(allocation.token || CONFIG.contractId)}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-slate-500">Claimable</div>
                        <div className="text-emerald-400 font-mono font-semibold">
                          {formatAmount(allocation.claimableAmount)}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">Locked</div>
                        <div className="text-slate-300 font-mono font-semibold">
                          {formatAmount(allocation.lockedAmount)}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 text-center text-sm text-slate-400">
              {publicKey
                ? loadingAllocations
                  ? "Loading indexed allocations..."
                  : "No indexed allocations found for this wallet yet."
                : "Connect your wallet to inspect eligibility."}
            </div>
          )}
        </div>

        {selected && (
          <div className="space-y-4 pt-4 border-t border-slate-800">
            <h3 className="text-sm font-semibold text-slate-300">
              3. Allocation Details
            </h3>

            <div className="bg-slate-950 border border-cyan-500/30 rounded-xl p-5 space-y-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <Coins className="w-8 h-8 text-cyan-400" />
                  <div>
                    <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                      Total Allocation
                    </span>
                    <div className="text-2xl font-bold text-white font-mono">
                      {formatAmount(selected.leaf.amount)}{" "}
                      <span className="text-sm text-cyan-400 font-normal">units</span>
                    </div>
                  </div>
                </div>
                <div className="text-right text-xs font-mono text-slate-400">
                  <div>Stream #{selected.distributionId}</div>
                  <div>Leaf #{selected.leaf.index}</div>
                  <div className="text-slate-500">Proof Steps: {selected.leaf.proof.length}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3">
                  <div className="flex items-center space-x-1 text-[10px] uppercase tracking-wider text-emerald-400">
                    <Unlock className="w-3 h-3" />
                    <span>Vested</span>
                  </div>
                  <div className="mt-1 text-sm font-mono font-bold text-emerald-300">
                    {formatAmount(selected.vestedAmount)}
                  </div>
                </div>
                <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3">
                  <div className="flex items-center space-x-1 text-[10px] uppercase tracking-wider text-cyan-400">
                    <Coins className="w-3 h-3" />
                    <span>Claimable</span>
                  </div>
                  <div className="mt-1 text-sm font-mono font-bold text-cyan-300">
                    {formatAmount(selected.claimableAmount)}
                  </div>
                </div>
                <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3">
                  <div className="flex items-center space-x-1 text-[10px] uppercase tracking-wider text-slate-400">
                    <Lock className="w-3 h-3" />
                    <span>Locked</span>
                  </div>
                  <div className="mt-1 text-sm font-mono font-bold text-slate-200">
                    {formatAmount(selected.lockedAmount)}
                  </div>
                </div>
                <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3">
                  <div className="flex items-center space-x-1 text-[10px] uppercase tracking-wider text-slate-400">
                    <CheckCircle className="w-3 h-3" />
                    <span>Claimed</span>
                  </div>
                  <div className="mt-1 text-sm font-mono font-bold text-slate-200">
                    {formatAmount(selected.claimedAmount)}
                  </div>
                </div>
              </div>

              {selected.schedule ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
                  <div className="bg-slate-900/40 border border-slate-800 rounded-lg px-3 py-2">
                    <div className="text-slate-500">Start</div>
                    <div className="text-slate-300">{formatTimestamp(selected.schedule.startTime)}</div>
                  </div>
                  <div className="bg-slate-900/40 border border-slate-800 rounded-lg px-3 py-2">
                    <div className="text-slate-500">Cliff</div>
                    <div className="text-slate-300">{formatTimestamp(selected.schedule.cliffTime)}</div>
                  </div>
                  <div className="bg-slate-900/40 border border-slate-800 rounded-lg px-3 py-2">
                    <div className="text-slate-500">Fully vested</div>
                    <div className="text-slate-300">{formatTimestamp(selected.schedule.endTime)}</div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  This allocation is not a vesting stream; the full amount is claimable while the campaign is active.
                </p>
              )}

              {selected.clawbackTime && (
                <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  Vesting was frozen by the issuer at {formatTimestamp(selected.clawbackTime)}. Already vested tokens remain claimable.
                </p>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <div className="flex items-center space-x-2">
                  {verifiedOnChain === true && (
                    <span className="flex items-center space-x-1.5 text-xs text-emerald-400 font-medium bg-emerald-500/10 py-1 px-2.5 rounded-md border border-emerald-500/20">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Verified On-Chain</span>
                    </span>
                  )}
                  {verifiedOnChain === false && (
                    <span className="text-xs text-rose-400 font-medium bg-rose-500/10 py-1 px-2.5 rounded-md border border-rose-500/20">
                      Verification Failed
                    </span>
                  )}
                  {verifiedOnChain === null && (
                    <span className="text-xs text-slate-400">
                      Pre-flight simulation recommended
                    </span>
                  )}
                </div>

                <button
                  onClick={handleVerifyOnChain}
                  disabled={verifying}
                  className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 py-1.5 px-3 rounded-lg border border-cyan-500/30 hover:bg-cyan-500/10 transition flex items-center space-x-1.5"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Simulate On-Chain Verify</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={handleExecuteClaim}
          disabled={claiming || !selected || !selected.isClaimable}
          className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-40 text-white font-semibold flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20 transition transform active:scale-[0.99]"
        >
          {claiming ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Signing & Claiming Vested Tokens...</span>
            </>
          ) : (
            <>
              <span>
                {selected
                  ? `Claim ${formatAmount(selected.claimableAmount)} Vested Units`
                  : "Claim Vested Allocation"}
              </span>
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>

        <div className="pt-4 border-t border-slate-800 space-y-3">
          <h3 className="text-sm font-semibold text-slate-300">
            Manual Proof Upload (fallback)
          </h3>
          <div className="border border-slate-800 hover:border-slate-700 bg-slate-950/40 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Upload className="w-5 h-5 text-cyan-400" />
              <div>
                <p className="text-sm text-slate-300 font-medium">
                  {snapshotData
                    ? `Loaded distribution #${snapshotData.distribution_id} (${snapshotData.leaf_count} leaves)`
                    : "Upload a campaign snapshot JSON"}
                </p>
                <p className="text-xs text-slate-500">
                  {snapshotData
                    ? `Root: ${snapshotData.merkle_root.slice(0, 18)}...`
                    : "If the indexer is unavailable, load the snapshot containing your proof."}
                </p>
              </div>
            </div>
            <label className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium py-2 px-3 rounded-lg cursor-pointer transition">
              <span>Choose File</span>
              <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
