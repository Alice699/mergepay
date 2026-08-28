"use client";

import { useContext } from "react";
import { WalletContext } from "@/providers/wallet-provider";

export function useWallet() {
  const wallet = useContext(WalletContext);

  if (!wallet) {
    throw new Error("useWallet must be used within WalletProvider");
  }

  return wallet;
}
