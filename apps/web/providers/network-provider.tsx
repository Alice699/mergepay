"use client";

import { useChainId } from "@rialo/frost";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAdaptivePolling } from "@/hooks/use-adaptive-polling";
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
      return health === "ok";
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      setRpcState({ status: "unavailable", health: null, error });
      return false;
    }
  }, []);

  useAdaptivePolling({
    enabled: true,
    intervalMs: 30_000,
    leading: true,
    maxIntervalMs: 120_000,
    poll: checkRpcHealth,
  });

  useEffect(() => {
    const markOffline = () => {
      setRpcState((current) => ({
        status: "unavailable",
        health: current.health,
        error: new Error("The browser is offline."),
      }));
    };

    window.addEventListener("offline", markOffline);
    if (navigator.onLine === false) markOffline();
    return () => window.removeEventListener("offline", markOffline);
  }, []);

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
