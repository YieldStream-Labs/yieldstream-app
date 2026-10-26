"use client";

import React, { useState } from "react";
import { Navbar } from "../components/Navbar";
import { IssuerDashboard } from "../components/IssuerDashboard";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"claim" | "issuer">("issuer");

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="flex-1">
        {activeTab === "issuer" ? (
          <IssuerDashboard />
        ) : (
          <div className="max-w-4xl mx-auto py-16 text-center text-slate-400">
            <h2 className="text-2xl font-bold text-white mb-2">Claim UI</h2>
            <p>Select your allocation to claim dividends.</p>
          </div>
        )}
      </main>
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500 font-mono">
        YieldStream Protocol &copy; 2026 &bull; Stellar Protocol 22/25
      </footer>
    </div>
  );
}
