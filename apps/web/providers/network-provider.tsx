"use client";

import { useChainId } from "@rialo/frost";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { networkLabel } from "@/lib/config";
import {
  expectedChainId,
  mergePayClient,
} from "@/lib/rialo";
import {
  NetworkContext,
  type NetworkSnapshot,
  type RpcStatus,
} from "@/providers/network-context";

export function NetworkProvider({ children }: Readonly<{ children: ReactNode }>) {
  const chainId = useChainId();
  const [rpcState, setRpcState] = useState<{
    status: RpcStatus;
    health: string | null;
    error: Error | null;
  }>({ status: "checking", health: null, error: null });

  const checkRpcHealth = useCallback(async (showChecking = false) => {
    if (showChecking) {
      setRpcState({ status: "checking", health: null, error: null });
    }

    try {
      const health = await mergePayClient.rpc.getHealth();
      setRpcState({
        status: health === "ok" ? "available" : "unavailable",
        health,
        error: health === "ok" ? null : new Error(`Rialo RPC health: ${health}`),
      });
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      setRpcState({ status: "unavailable", health: null, error });
    }
  }, []);

  useEffect(() => {
    let active = true;

    const initialCheck = window.setTimeout(() => {
      if (active) void checkRpcHealth();
    }, 0);
    const interval = window.setInterval(() => {
      if (active) void checkRpcHealth();
    }, 30_000);

    return () => {
      active = false;
      window.clearTimeout(initialCheck);
      window.clearInterval(interval);
    };
  }, [checkRpcHealth]);

  const value = useMemo<NetworkSnapshot>(
    () => ({
      client: mergePayClient,
      network: mergePayClient.network,
      label: `Rialo ${networkLabel(mergePayClient.network)}`,
      chainId,
      expectedChainId,
      rpcUrl: mergePayClient.rpc.getUrl(),
      rpcStatus: rpcState.status,
      rpcHealth: rpcState.health,
      rpcError: rpcState.error,
      isExpectedNetwork: chainId === expectedChainId,
      refreshRpcHealth: () => void checkRpcHealth(true),
    }),
    [chainId, checkRpcHealth, rpcState],
  );

  return (
    <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
  );
}
