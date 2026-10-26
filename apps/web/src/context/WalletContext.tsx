"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import freighter from "@stellar/freighter-api";

interface WalletContextType {
  isConnected: boolean;
  publicKey: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  signTransaction: (xdr: string) => Promise<string>;
  error: string | null;
}

const WalletContext = createContext<WalletContextType>({
  isConnected: false,
  publicKey: null,
  connect: async () => {},
  disconnect: () => {},
  signTransaction: async () => "",
  error: null,
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkConnection() {
      try {
        if (typeof window !== "undefined") {
          const connected = await freighter.isConnected();
          if (connected) {
            const key = await freighter.getPublicKey();
            if (key) {
              setPublicKey(key);
              setIsConnected(true);
            }
          }
        }
      } catch {
        // Extension not installed or blocked
      }
    }
    checkConnection();
  }, []);

  const connect = async () => {
    try {
      setError(null);
      const connected = await freighter.isConnected();
      if (!connected) {
        throw new Error("Freighter wallet extension is not installed or available.");
      }
      const key = await freighter.getPublicKey();
      if (!key) {
        throw new Error("Failed to retrieve public key from Freighter.");
      }
      setPublicKey(key);
      setIsConnected(true);
    } catch (err: any) {
      setError(err?.message || "Wallet connection failed");
      throw err;
    }
  };

  const disconnect = () => {
    setPublicKey(null);
    setIsConnected(false);
    setError(null);
  };

  const signTransaction = async (txXdr: string): Promise<string> => {
    try {
      const signed = await freighter.signTransaction(txXdr, {
        networkPassphrase:
          process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ||
          "Test SDF Network ; September 2015",
      });
      return signed;
    } catch (err: any) {
      throw new Error(`User rejected or failed transaction signing: ${err?.message || err}`);
    }
  };

  return (
    <WalletContext.Provider
      value={{
        isConnected,
        publicKey,
        connect,
        disconnect,
        signTransaction,
        error,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
