"use client";

import { useContext } from "react";
import { NetworkContext } from "@/providers/network-context";

export function useNetwork() {
  const network = useContext(NetworkContext);

  if (!network) {
    throw new Error("useNetwork must be used within NetworkProvider");
  }

  return network;
}
