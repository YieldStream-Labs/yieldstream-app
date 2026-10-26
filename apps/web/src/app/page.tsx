"use client";

import React, { useState } from "react";
import { Navbar } from "../components/Navbar";
import { IssuerDashboard } from "../components/IssuerDashboard";
import { ClaimDashboard } from "../components/ClaimDashboard";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"claim" | "issuer">("claim");

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="flex-1">
        {activeTab === "claim" ? <ClaimDashboard /> : <IssuerDashboard />}
      </main>
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500 font-mono">
        YieldStream Protocol &copy; 2026 &bull; Stellar Protocol 22/25
      </footer>
    </div>
  );
}
