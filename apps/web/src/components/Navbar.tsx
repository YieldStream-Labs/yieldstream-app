"use client";

import React from "react";
import { useWallet } from "../context/WalletContext";
import { Wallet, LogOut, Layers } from "lucide-react";

interface NavbarProps {
  activeTab: "claim" | "issuer";
  setActiveTab: (tab: "claim" | "issuer") => void;
}

export function Navbar({ activeTab, setActiveTab }: NavbarProps) {
  const { isConnected, publicKey, connect, disconnect } = useWallet();

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  };

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-8">
          <div className="flex items-center space-x-3 cursor-pointer">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Layers className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-xl font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                YieldStream
              </span>
              <span className="block text-[10px] text-cyan-400 font-mono tracking-wider">
                MERKLE DISTRIBUTOR
              </span>
            </div>
          </div>

          <nav className="hidden md:flex space-x-1 bg-slate-900/60 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setActiveTab("claim")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                activeTab === "claim"
                  ? "bg-blue-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Claim Dividends
            </button>
            <button
              onClick={() => setActiveTab("issuer")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                activeTab === "issuer"
                  ? "bg-blue-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Issuer Dashboard
            </button>
          </nav>
        </div>

        <div className="flex items-center space-x-4">
          {isConnected && publicKey ? (
            <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 py-1.5 px-3 rounded-xl">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-sm text-slate-300">
                {truncateAddress(publicKey)}
              </span>
              <button
                onClick={disconnect}
                title="Disconnect"
                className="text-slate-500 hover:text-rose-400 ml-1"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={connect}
              className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-medium py-2 px-4 rounded-xl shadow-lg shadow-blue-500/20 transition transform active:scale-95 text-sm"
            >
              <Wallet className="w-4 h-4" />
              <span>Connect Freighter</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
