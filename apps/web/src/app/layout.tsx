import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "../context/WalletContext";

export const metadata: Metadata = {
  title: "YieldStream | Multi-Tenant Merkle Distributor",
  description: "Multi-tenant Merkle dividend distributor on Stellar Soroban",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 min-h-screen">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
