"use client";

import React, { useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { CONFIG } from "../config";
import { YieldStreamClient } from "@yieldstream/sdk";
import { DistributionSnapshotJSON, LeafSnapshot, verifyProof } from "@yieldstream/merkle";
import {
  Wallet,
  CheckCircle,
  AlertCircle,
  ShieldCheck,
  Coins,
  ArrowRight,
  Loader2,
  Upload,
} from "lucide-react";
import { Transaction } from "@stellar/stellar-sdk";

export function ClaimDashboard() {
  const { isConnected, publicKey, connect, signTransaction } = useWallet();

  const [distributionId, setDistributionId] = useState("1");
  const [snapshotData, setSnapshotData] = useState<DistributionSnapshotJSON | null>(null);
  const [userLeaf, setUserLeaf] = useState<LeafSnapshot | null>(null);

  const [verifying, setVerifying] = useState(false);
  const [verifiedOnChain, setVerifiedOnChain] = useState<boolean | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimSuccessTx, setClaimSuccessTx] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Scan snapshot for user allocation whenever publicKey or snapshotData changes
  useEffect(() => {
    if (!snapshotData || !publicKey) {
      setUserLeaf(null);
      setVerifiedOnChain(null);
      return;
    }

    const match = snapshotData.leaves.find(
      (l) => l.claimant.toLowerCase() === publicKey.toLowerCase()
    );

    if (match) {
      setUserLeaf(match);
      // Run local client-side proof check immediately
      try {
        const rootBuf = Buffer.from(snapshotData.merkle_root.replace(/^0x/, ""), "hex");
        const leafBuf = Buffer.from(match.leaf.replace(/^0x/, ""), "hex");
        const proofBufs = match.proof.map((p) =>
          Buffer.from(p.replace(/^0x/, ""), "hex")
        );
        const validLocal = verifyProof(proofBufs, rootBuf, leafBuf);
        if (!validLocal) {
          setError("Local Merkle proof verification failed for this allocation.");
        }
      } catch (err: any) {
        console.error(err);
      }
    } else {
      setUserLeaf(null);
    }
  }, [snapshotData, publicKey]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setClaimSuccessTx(null);
    setVerifiedOnChain(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed: DistributionSnapshotJSON = JSON.parse(
          event.target?.result as string
        );
        if (!parsed.merkle_root || !parsed.leaves) {
          throw new Error("Invalid snapshot format: must include merkle_root and leaves");
        }
        setSnapshotData(parsed);
        if (parsed.distribution_id) {
          setDistributionId(parsed.distribution_id);
        }
      } catch (err: any) {
        setError(`Failed to parse snapshot JSON: ${err.message}`);
        setSnapshotData(null);
      }
    };
    reader.readAsText(file);
  };

  const handleVerifyOnChain = async () => {
    if (!userLeaf || !publicKey) return;

    setVerifying(true);
    setError(null);

    try {
      const client = new YieldStreamClient({
        rpcUrl: CONFIG.rpcUrl,
        networkPassphrase: CONFIG.networkPassphrase,
        contractId: CONFIG.contractId,
      });

      const proofBufs = userLeaf.proof.map((p) =>
        Buffer.from(p.replace(/^0x/, ""), "hex")
      );

      const isValid = await client.verify({
        id: BigInt(distributionId),
        index: userLeaf.index,
        claimant: publicKey,
        amount: BigInt(userLeaf.amount),
        proof: proofBufs,
      });

      setVerifiedOnChain(isValid);
      if (!isValid) {
        setError("On-chain verification simulation returned false. Root or allocation mismatch.");
      }
    } catch (err: any) {
      console.error(err);
      setError(`On-chain verification error: ${err?.message || err}`);
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

    if (!userLeaf) {
      setError("No claimable allocation found for the connected wallet.");
      return;
    }

    setClaiming(true);
    setError(null);
    setClaimSuccessTx(null);

    try {
      const client = new YieldStreamClient({
        rpcUrl: CONFIG.rpcUrl,
        networkPassphrase: CONFIG.networkPassphrase,
        contractId: CONFIG.contractId,
      });

      const proofBufs = userLeaf.proof.map((p) =>
        Buffer.from(p.replace(/^0x/, ""), "hex")
      );

      const unsignedTx = await client.buildClaimTx(
        {
          id: BigInt(distributionId),
          index: userLeaf.index,
          claimant: publicKey,
          amount: BigInt(userLeaf.amount),
          proof: proofBufs,
        },
        publicKey
      );

      const signedXdr = await signTransaction(unsignedTx.toXDR());
      const signedTx = new Transaction(signedXdr, CONFIG.networkPassphrase);

      const res = await client.submitTransaction(signedTx);
      setClaimSuccessTx(res.txHash);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Claim transaction failed");
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 sm:px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          Claim Dividend Allocations
        </h1>
        <p className="mt-2 text-slate-400">
          Connect your Freighter wallet, load the campaign snapshot, verify your cryptographic proof on-chain, and claim your rewards.
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
              Dividends Successfully Claimed!
            </h3>
          </div>
          <p className="text-slate-300 text-sm">
            Claimed <span className="font-bold text-white font-mono">{userLeaf?.amount}</span> stroops to{" "}
            <span className="font-mono text-cyan-300">{publicKey}</span>
          </p>
          <p className="text-slate-400 text-xs mt-1 font-mono break-all">
            Tx Hash: {claimSuccessTx}
          </p>
        </div>
      )}

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
        {/* Step 1: Connect Wallet */}
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

        {/* Step 2: Upload or Select Snapshot */}
        <div className="space-y-4">
          <label className="block text-sm font-semibold text-slate-300">
            2. Load Campaign Snapshot File
          </label>
          <div className="border border-slate-800 hover:border-slate-700 bg-slate-950/40 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Upload className="w-5 h-5 text-cyan-400" />
              <div>
                <p className="text-sm text-slate-300 font-medium">
                  {snapshotData
                    ? `Loaded distribution #${snapshotData.distribution_id} (${snapshotData.leaf_count} leaves)`
                    : "Upload campaign snapshot JSON"}
                </p>
                <p className="text-xs text-slate-500">
                  {snapshotData
                    ? `Root: ${snapshotData.merkle_root.slice(0, 18)}...`
                    : "JSON containing Merkle proofs for this distribution"}
                </p>
              </div>
            </div>
            <label className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium py-2 px-3 rounded-lg cursor-pointer transition">
              <span>Choose File</span>
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Step 3: Allocation Discovery & Proof Verification */}
        {snapshotData && (
          <div className="space-y-4 pt-4 border-t border-slate-800">
            <h3 className="text-sm font-semibold text-slate-300">
              3. Allocation Details & Verification
            </h3>

            {userLeaf ? (
              <div className="bg-slate-950 border border-cyan-500/30 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Coins className="w-8 h-8 text-cyan-400" />
                    <div>
                      <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                        Your Eligible Dividend
                      </span>
                      <div className="text-2xl font-bold text-white font-mono">
                        {userLeaf.amount}{" "}
                        <span className="text-sm text-cyan-400 font-normal">units</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-xs font-mono text-slate-400">
                    <div>Leaf Index: #{userLeaf.index}</div>
                    <div className="text-slate-500">Proof Steps: {userLeaf.proof.length}</div>
                  </div>
                </div>

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
            ) : (
              <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 text-center text-sm text-slate-400">
                {publicKey ? (
                  <p>
                    Connected wallet <span className="font-mono text-slate-300">{publicKey}</span> is
                    not included in this snapshot.
                  </p>
                ) : (
                  <p>Connect your wallet to inspect eligibility.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Execute Claim */}
        <button
          onClick={handleExecuteClaim}
          disabled={claiming || !userLeaf}
          className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-40 text-white font-semibold flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20 transition transform active:scale-[0.99]"
        >
          {claiming ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Signing & Claiming Dividend...</span>
            </>
          ) : (
            <>
              <span>Claim Dividend Allocation</span>
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
