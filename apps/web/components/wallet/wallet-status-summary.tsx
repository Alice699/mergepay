"use client";

import { useWallet } from "@/hooks/use-wallet";

export function WalletStatusSummary() {
  const wallet = useWallet();
  const label =
    wallet.status === "connected"
      ? "Connected"
      : wallet.status === "connecting" || wallet.status === "reconnecting"
        ? "Connecting"
        : wallet.status === "discovering"
          ? "Loading"
          : wallet.status === "locked"
            ? "Locked"
          : wallet.status === "unavailable"
            ? "Not detected"
            : "Not connected";
  const good = wallet.status === "connected";
  const walletType =
    wallet.source === "embedded"
      ? "Local DevNet wallet"
      : wallet.source === "extension"
        ? "Browser extension"
        : wallet.embedded.address
          ? "Local DevNet wallet"
          : "Rialo signer";

  return <div><i className={`status-indicator ${good ? "status-indicator--good" : ""}`} /><span>{walletType}</span><strong>{label}</strong></div>;
}
