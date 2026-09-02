"use client";

import { createContext } from "react";
import type { MergePayClient, RialoNetwork } from "@mergepay/rialo-client";
import type { IdentifierString } from "@rialo/ts-cdk";

export type RpcStatus = "checking" | "available" | "unavailable";

export interface NetworkSnapshot {
  client: MergePayClient;
  network: RialoNetwork;
  label: string;
  chainId: string;
  expectedChainId: IdentifierString;
  rpcUrl: string;
  rpcStatus: RpcStatus;
  rpcHealth: string | null;
  rpcError: Error | null;
  isExpectedNetwork: boolean;
  refreshRpcHealth: () => void;
}

export const NetworkContext = createContext<NetworkSnapshot | null>(null);
