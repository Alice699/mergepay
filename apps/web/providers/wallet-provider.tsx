"use client";

import { createContext, useMemo, type ReactNode } from "react";

export interface WalletSnapshot {
  status: "unavailable" | "disconnected" | "connecting" | "connected";
  address: string | null;
}

export const WalletContext = createContext<WalletSnapshot | null>(null);

export function WalletProvider({ children }: Readonly<{ children: ReactNode }>) {
  const value = useMemo<WalletSnapshot>(
    () => ({ status: "unavailable", address: null }),
    [],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}
