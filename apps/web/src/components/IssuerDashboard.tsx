"use client";

import React, { useState } from "react";
import { useWallet } from "../context/WalletContext";
import { CONFIG } from "../config";
import { YieldStreamClient } from "@yieldstream/sdk";
import { DistributionSnapshotJSON } from "@yieldstream/merkle";
import { UploadCloud, CheckCircle2, AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { Transaction } from "@stellar/stellar-sdk";

export function IssuerDashboard() {
  const { isConnected, publicKey, connect, signTransaction } = useWallet();

  const [tokenAddress, setTokenAddress] = useState("");
  const [snapshotLedger, setSnapshotLedger] = useState("0");
  const [durationDays, setDurationDays] = useState("30");
  const [snapshotData, setSnapshotData] = useState<DistributionSnapshotJSON | null>(null);
  const [fileName, setFileName] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSuccess, setTxSuccess] = useState<string | null>(null);
  const [deployedDistId, setDeployedDistId] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setTxSuccess(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed.merkle_root || !parsed.leaves || !Array.isArray(parsed.leaves)) {
          throw new Error("Invalid snapshot format: must include merkle_root and leaves array");
        }
        setSnapshotData(parsed);
      } catch (err: any) {
        setError(`JSON parse error: ${err.message}`);
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

    try {
      const client = new YieldStreamClient({
        rpcUrl: CONFIG.rpcUrl,
        networkPassphrase: CONFIG.networkPassphrase,
        contractId: CONFIG.contractId,
      });

      const now = Math.floor(Date.now() / 1000);
      const expiresAt = BigInt(now + Number(durationDays) * 86400);

      const rootBuf = Buffer.from(snapshotData.merkle_root.replace(/^0x/, ""), "hex");
      const metaHashBuf = snapshotData.meta_hash
        ? Buffer.from(snapshotData.meta_hash.replace(/^0x/, ""), "hex")
        : Buffer.alloc(32);

      const unsignedTx = await client.buildCreateDistributionTx(
        {
          issuer: publicKey,
          token: tokenAddress.trim(),
          total: BigInt(snapshotData.total_amount),
          root: rootBuf,
          leafCount: snapshotData.leaf_count,
          snapshotLedger: Number(snapshotLedger),
          metaHash: metaHashBuf,
          opensAt: BigInt(now),
          expiresAt,
        },
        publicKey
      );

      const signedXdr = await signTransaction(unsignedTx.toXDR());
      const signedTx = new Transaction(signedXdr, CONFIG.networkPassphrase);

      const result = await client.submitTransaction(signedTx);
      setTxSuccess(result.txHash);
      setDeployedDistId(snapshotData.distribution_id);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Transaction creation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 sm:px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          Issuer Campaign Dashboard
        </h1>
        <p className="mt-2 text-slate-400">
          Fund and initialize multi-tenant dividend distributions using Merkle roots generated from on-chain snapshots.
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
              Distribution Successfully Created!
            </h3>
          </div>
          <p className="text-slate-300 text-sm">
            Distribution ID: <span className="font-mono text-cyan-300 font-bold">#{deployedDistId}</span>
          </p>
          <p className="text-slate-400 text-xs mt-1 font-mono break-all">
            Tx Hash: {txSuccess}
          </p>
        </div>
      )}

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
        <div>
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
              {fileName ? fileName : "Click to select or drag and drop merkle snapshot JSON"}
            </span>
            <p className="text-xs text-slate-500 mt-1">
              Supports snapshots produced by @yieldstream/indexer or @yieldstream/merkle
            </p>
          </div>
        </div>

        {snapshotData && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono space-y-2">
            <div className="flex justify-between border-b border-slate-800 pb-2">
              <span className="text-slate-400">Distribution ID:</span>
              <span className="text-cyan-400 font-bold">#{snapshotData.distribution_id}</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 pb-2">
              <span className="text-slate-400">Total Leaf Recipients:</span>
              <span className="text-white">{snapshotData.leaf_count.toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 pb-2">
              <span className="text-slate-400">Total Dividend Pool:</span>
              <span className="text-emerald-400 font-bold">{snapshotData.total_amount} units</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 pb-2">
              <span className="text-slate-400">Merkle Root:</span>
              <span className="text-slate-300 truncate max-w-[320px]">{snapshotData.merkle_root}</span>
            </div>
            {snapshotData.meta_hash && (
              <div className="flex justify-between">
                <span className="text-slate-400">Meta Hash:</span>
                <span className="text-slate-300 truncate max-w-[320px]">{snapshotData.meta_hash}</span>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-1">
              2. Distributed Token Contract Address
            </label>
            <input
              type="text"
              placeholder="e.g. CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-1">
              Snapshot Ledger Sequence
            </label>
            <input
              type="number"
              placeholder="0 for latest"
              value={snapshotLedger}
              onChange={(e) => setSnapshotLedger(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-1">
            Claim Window Duration (Days)
          </label>
          <input
            type="number"
            min="1"
            max="365"
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
          />
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
              <span>{isConnected ? "Create & Fund Distribution" : "Connect Wallet to Create"}</span>
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
