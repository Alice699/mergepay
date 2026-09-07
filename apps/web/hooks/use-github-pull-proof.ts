"use client";

import { useCallback, useState } from "react";

export interface GitHubPullProof {
  owner: string;
  repo: string;
  number: number;
  title: string;
  state: "open" | "closed" | string;
  htmlUrl: string;
  mergedAt: string | null;
  author: {
    id: number | null;
    login: string;
    avatarUrl: string | null;
  };
}

export type GitHubPullProofState =
  | { status: "idle" | "loading"; proof: null; error: null }
  | { status: "success"; proof: GitHubPullProof; error: null }
  | { status: "error"; proof: null; error: Error };

interface GitHubPullInput {
  owner: string;
  repo: string;
  number: bigint | number;
}

export function useGitHubPullProof() {
  const [state, setState] = useState<GitHubPullProofState>({
    status: "idle",
    proof: null,
    error: null,
  });

  const verify = useCallback(async (input: GitHubPullInput) => {
    setState({ status: "loading", proof: null, error: null });
    try {
      const response = await fetch(
        `/api/github/pull?owner=${encodeURIComponent(input.owner)}&repo=${encodeURIComponent(input.repo)}&number=${encodeURIComponent(String(input.number))}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as GitHubPullProof | { error?: string };
      if (!response.ok || !("author" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "GitHub pull request could not be verified.");
      }
      setState({ status: "success", proof: payload, error: null });
      return payload;
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      setState({ status: "error", proof: null, error });
      throw error;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ status: "idle", proof: null, error: null });
  }, []);

  return { ...state, verify, reset };
}
