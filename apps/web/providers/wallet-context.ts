"use client";

import { createContext } from "react";
import type { AccountEntity, WalletEntity } from "@rialo/frost";
import type { MergePayConfirmation } from "@mergepay/rialo-client";
import type { IdentifierString, Transaction } from "@rialo/ts-cdk";
import type { EmbeddedWalletStatus } from "@/hooks/use-embedded-wallet";

export type WalletConnectionStatus =
  | "discovering"
  | "unavailable"
  | "disconnected"
  | "locked"
  | "connecting"
  | "reconnecting"
  | "connected";

export type WalletSource = "extension" | "embedded" | null;

export type WalletBalanceStatus = "idle" | "loading" | "ready" | "error";

export type WalletTransactionPhase =
  | "idle"
  | "reviewing"
  | "signing"
  | "submitting"
  | "confirmed"
  | "failed";

export type EmbeddedWalletFundingPhase =
  | "idle"
  | "requesting"
  | "confirmed"
  | "failed";

export interface WalletBalanceSnapshot {
  status: WalletBalanceStatus;
  kelvin: bigint | null;
  formatted: string | null;
  error: Error | null;
  refresh: () => void;
}

export interface WalletTransactionSnapshot {
  phase: WalletTransactionPhase;
  signature: string | null;
  error: Error | null;
}

export interface WalletTransactionIntent {
  action: string;
  summary: string;
  amountKelvin?: string;
  workflowAddress?: string;
}

export interface WalletTransactionApproval {
  id: number;
  action: string;
  summary: string;
  payer: string;
  programs: string[];
  instructionCount: number;
  validFrom: string | null;
  amountKelvin: string | null;
  workflowAddress: string | null;
}

export interface EmbeddedWalletSnapshot {
  available: boolean;
  status: EmbeddedWalletStatus;
  address: string | null;
  createdAt: string | null;
  error: Error | null;
  funding: {
    phase: EmbeddedWalletFundingPhase;
    signature: string | null;
    error: Error | null;
  };
  create: (password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  lock: () => void;
  remove: () => Promise<void>;
  exportBackup: () => Promise<string>;
  restoreBackup: (backup: string, password: string) => Promise<void>;
  requestDevnetFunds: () => Promise<MergePayConfirmation>;
}

export interface WalletSnapshot {
  status: WalletConnectionStatus;
  source: WalletSource;
  address: string | null;
  walletName: string | null;
  activeAccount: AccountEntity | null;
  activeWallet: WalletEntity | null;
  wallets: WalletEntity[];
  walletsReady: boolean;
  connectError: Error | null;
  disconnectError: Error | null;
  balance: WalletBalanceSnapshot;
  transaction: WalletTransactionSnapshot;
  approval: WalletTransactionApproval | null;
  embedded: EmbeddedWalletSnapshot;
  expectedChainId: IdentifierString;
  networkSupported: boolean | null;
  connect: (walletName?: string) => Promise<{
    walletName: string;
    accountAddress: string;
  }>;
  disconnect: () => Promise<void>;
  submitTransaction: (
    transaction: Transaction | Uint8Array,
    intent?: WalletTransactionIntent,
  ) => Promise<MergePayConfirmation>;
  approveTransaction: () => void;
  rejectTransaction: () => void;
  resetTransaction: () => void;
}

export const WalletContext = createContext<WalletSnapshot | null>(null);
