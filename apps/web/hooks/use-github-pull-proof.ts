"use client";

import { useCallback, useState } from "react";
import { githubApiErrorFromResponse } from "@/lib/github-api-error";
import type { GitHubClaimAuthorization } from "@/lib/github-claim-authorization";

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
  authorization: GitHubClaimAuthorization;
}

export type GitHubPullProofState =
  | { status: "idle" | "loading"; proof: null; error: null }
  | { status: "success"; proof: GitHubPullProof; error: null }
  | { status: "error"; proof: null; error: Error };

interface GitHubPullInput {
  owner: string;
  repo: string;
  number: bigint | number;
  walletAddress: string;
  targetWorkflow: string;
  workflowSlug: string;
}

function isGitHubPullProof(value: unknown): value is GitHubPullProof {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<GitHubPullProof>;
  return (
    Number.isSafeInteger(candidate.number) &&
    Number.isSafeInteger(candidate.author?.id) &&
    typeof candidate.author?.login === "string" &&
    typeof candidate.authorization?.token === "string" &&
    typeof candidate.authorization.nonce === "string" &&
    Number.isSafeInteger(candidate.authorization.expiresAt) &&
    typeof candidate.authorization.walletAddress === "string" &&
    typeof candidate.authorization.targetWorkflow === "string" &&
    typeof candidate.authorization.claimWorkflow === "string" &&
    typeof candidate.authorization.workflowSlug === "string"
  );
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
      const response = await fetch("/api/github/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: input.owner,
          repo: input.repo,
          number: String(input.number),
          walletAddress: input.walletAddress,
          targetWorkflow: input.targetWorkflow,
          workflowSlug: input.workflowSlug,
        }),
        cache: "no-store",
      });
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw githubApiErrorFromResponse(
          response,
          null,
          "GitHub verification returned an unreadable response.",
        );
      }
      if (!response.ok || !isGitHubPullProof(payload)) {
        throw githubApiErrorFromResponse(
          response,
          payload,
          "GitHub pull request could not be verified.",
        );
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
