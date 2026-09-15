"use client";

import { useChainId } from "@rialo/frost";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
    lastCheckedAt: number | null;
    lastSuccessfulAt: number | null;
    latencyMs: number | null;
    consecutiveFailures: number;
  }>({
    status: "checking",
    health: null,
    error: null,
    lastCheckedAt: null,
    lastSuccessfulAt: null,
    latencyMs: null,
    consecutiveFailures: 0,
  });
  const activeRpcCheckRef = useRef<Promise<boolean> | null>(null);

  const checkRpcHealth = useCallback((showChecking = false) => {
    if (showChecking) {
      setRpcState((current) => ({
        ...current,
        status: "checking",
        error: null,
      }));
    }
    if (activeRpcCheckRef.current) return activeRpcCheckRef.current;

    const startedAt = Date.now();
    const operation = (async () => {
      try {
        const health = await mergePayClient.rpc.getHealth();
        const checkedAt = Date.now();
        const available = health === "ok";
        setRpcState((current) => ({
          status: available ? "available" : "unavailable",
          health,
          error: available ? null : new Error(`Rialo RPC health: ${health}`),
          lastCheckedAt: checkedAt,
          lastSuccessfulAt: available ? checkedAt : current.lastSuccessfulAt,
          latencyMs: checkedAt - startedAt,
          consecutiveFailures: available
            ? 0
            : current.consecutiveFailures + 1,
        }));
        return available;
      } catch (cause) {
        const checkedAt = Date.now();
        const error = cause instanceof Error ? cause : new Error(String(cause));
        setRpcState((current) => ({
          status: "unavailable",
          health: null,
          error,
          lastCheckedAt: checkedAt,
          lastSuccessfulAt: current.lastSuccessfulAt,
          latencyMs: checkedAt - startedAt,
          consecutiveFailures: current.consecutiveFailures + 1,
        }));
        return false;
      }
    })();
    activeRpcCheckRef.current = operation;
    void operation.finally(() => {
      if (activeRpcCheckRef.current === operation) {
        activeRpcCheckRef.current = null;
      }
    });
    return operation;
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
        ...current,
        status: "unavailable",
        error: new Error("The browser is offline."),
        lastCheckedAt: Date.now(),
        consecutiveFailures: Math.max(1, current.consecutiveFailures),
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
      rpcLastCheckedAt: rpcState.lastCheckedAt,
      rpcLastSuccessfulAt: rpcState.lastSuccessfulAt,
      rpcLatencyMs: rpcState.latencyMs,
      rpcConsecutiveFailures: rpcState.consecutiveFailures,
      isExpectedNetwork: chainId === expectedChainId,
      refreshRpcHealth: () => void checkRpcHealth(true),
    }),
    [chainId, checkRpcHealth, rpcState],
  );

  return (
    <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
  );
}
