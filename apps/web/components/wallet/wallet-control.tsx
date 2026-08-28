"use client";

import { WalletCards } from "lucide-react";
import { useWallet } from "@/hooks/use-wallet";
import { shortenAddress } from "@/lib/format";

export function WalletControl() {
  const wallet = useWallet();
  if (wallet.status === "connected" && wallet.address) {
    return <button className="wallet-button"><WalletCards aria-hidden="true" size={14} />{shortenAddress(wallet.address)}</button>;
  }
  return (
    <button
      aria-label="Wallet unavailable. Rialo wallet integration is not connected yet."
      className="wallet-button wallet-button--disabled"
      disabled
      title="Rialo wallet integration is not available yet"
    >
      <WalletCards aria-hidden="true" size={14} />
      <span>Wallet</span>
      <b>Unavailable</b>
    </button>
  );
}
