"use client";

import type { ReactNode } from "react";
import { FrostProvider } from "@rialo/frost";
import { TransactionNotifications } from "@/components/feedback/transaction-notifications";
import { TransactionApprovalDialog } from "@/components/wallet/transaction-approval-dialog";
import { frostConfig } from "@/lib/rialo";
import { NetworkProvider } from "@/providers/network-provider";
import { QueryProvider } from "@/providers/query-provider";
import { WalletProvider } from "@/providers/wallet-provider";

export function AppProviders({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <FrostProvider config={frostConfig}>
      <NetworkProvider>
        <WalletProvider>
          <TransactionApprovalDialog />
          <TransactionNotifications />
          <QueryProvider>{children}</QueryProvider>
        </WalletProvider>
      </NetworkProvider>
    </FrostProvider>
  );
}
