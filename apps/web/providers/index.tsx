"use client";

import type { ReactNode } from "react";
import { NetworkProvider } from "./network-provider";
import { QueryProvider } from "./query-provider";
import { WalletProvider } from "./wallet-provider";

export function AppProviders({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <NetworkProvider>
      <WalletProvider>
        <QueryProvider>{children}</QueryProvider>
      </WalletProvider>
    </NetworkProvider>
  );
}
