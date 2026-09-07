"use client";

import { useCallback, useEffect, useState } from "react";
import type { GitHubIdentity } from "@/lib/github-auth";

interface GitHubSessionResponse {
  configured: boolean;
  authenticated: boolean;
  identity: GitHubIdentity | null;
}

export type GitHubIdentityStatus = "loading" | "ready" | "error";

export function useGitHubIdentity() {
  const [identity, setIdentity] = useState<GitHubIdentity | null>(null);
  const [configured, setConfigured] = useState(false);
  const [status, setStatus] = useState<GitHubIdentityStatus>("loading");
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch("/api/github/auth/session", { cache: "no-store" });
      const payload = (await response.json()) as GitHubSessionResponse;
      if (!response.ok) throw new Error("GitHub identity status could not be read.");
      setConfigured(payload.configured);
      setIdentity(payload.authenticated ? payload.identity : null);
      setStatus("ready");
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    }
  }, []);

  useEffect(() => {
    const request = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(request);
  }, [refresh]);

  const connect = useCallback((returnTo?: string) => {
    const target = returnTo || `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/api/github/auth/start?returnTo=${encodeURIComponent(target)}`);
  }, []);

  const disconnect = useCallback(async () => {
    await fetch("/api/github/auth/logout", { method: "POST" });
    setIdentity(null);
    setStatus("ready");
  }, []);

  return {
    configured,
    connect,
    disconnect,
    error,
    identity,
    isAuthenticated: Boolean(identity),
    refresh,
    status,
  };
}
