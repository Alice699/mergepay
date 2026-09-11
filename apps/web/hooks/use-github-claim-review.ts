"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type GitHubClaimReview,
  type GitHubClaimReviewInput,
  verifyGitHubClaimAuthor,
} from "@/lib/github-claim-review";

export type GitHubClaimReviewState =
  | { status: "idle" | "loading"; review: null; error: null }
  | { status: "success"; review: GitHubClaimReview; error: null }
  | { status: "error"; review: null; error: Error };

type SettledGitHubClaimReview =
  | { key: string; status: "success"; review: GitHubClaimReview; error: null }
  | { key: string; status: "error"; review: null; error: Error };

export function useGitHubClaimReview(input: GitHubClaimReviewInput | null) {
  const [refreshToken, setRefreshToken] = useState(0);
  const [settled, setSettled] = useState<SettledGitHubClaimReview | null>(null);
  const owner = input?.owner ?? null;
  const repo = input?.repo ?? null;
  const number = input ? String(input.number) : null;
  const claimantGithubId = input?.claimantGithubId.toString() ?? null;
  const claimantGithubLogin = input?.claimantGithubLogin ?? null;
  const inputReady = Boolean(
    owner && repo && number && claimantGithubId && claimantGithubLogin,
  );
  const requestKey = inputReady
    ? [
        owner,
        repo,
        number,
        claimantGithubId,
        claimantGithubLogin,
        String(refreshToken),
      ].join("\u0000")
    : null;

  useEffect(() => {
    if (
      !requestKey ||
      !owner ||
      !repo ||
      !number ||
      !claimantGithubId ||
      !claimantGithubLogin
    ) return;

    const controller = new AbortController();
    void verifyGitHubClaimAuthor(
      {
        owner,
        repo,
        number: BigInt(number),
        claimantGithubId: BigInt(claimantGithubId),
        claimantGithubLogin,
      },
      controller.signal,
    ).then(
      (review) => {
        if (!controller.signal.aborted) {
          setSettled({
            key: requestKey,
            status: "success",
            review,
            error: null,
          });
        }
      },
      (cause) => {
        if (!controller.signal.aborted) {
          setSettled({
            key: requestKey,
            status: "error",
            review: null,
            error: cause instanceof Error ? cause : new Error(String(cause)),
          });
        }
      },
    );

    return () => controller.abort();
  }, [
    claimantGithubId,
    claimantGithubLogin,
    number,
    owner,
    repo,
    requestKey,
  ]);

  const retry = useCallback(() => {
    setRefreshToken((value) => value + 1);
  }, []);

  const state: GitHubClaimReviewState = !requestKey
    ? { status: "idle", review: null, error: null }
    : settled?.key === requestKey
      ? settled
      : { status: "loading", review: null, error: null };

  return { ...state, retry };
}
