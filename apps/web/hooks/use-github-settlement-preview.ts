"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { githubApiErrorFromResponse } from "@/lib/github-api-error";

export interface GitHubSettlementPreview {
  owner: string;
  repo: string;
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  mergedAt: string | null;
  mergeCommitSha: string | null;
  headSha: string;
  baseRef: string;
  author: {
    id: number;
    login: string;
    avatarUrl: string | null;
  };
}

type PreviewState =
  | { status: "idle" | "loading"; preview: null; error: null }
  | { status: "success"; preview: GitHubSettlementPreview; error: null }
  | { status: "error"; preview: null; error: Error };

interface PreviewInput {
  owner: string;
  repo: string;
  number: number;
}

function isPreview(value: unknown): value is GitHubSettlementPreview {
  if (typeof value !== "object" || value === null) return false;
  const preview = value as Partial<GitHubSettlementPreview>;
  return (
    typeof preview.owner === "string" &&
    typeof preview.repo === "string" &&
    Number.isSafeInteger(preview.number) &&
    typeof preview.title === "string" &&
    typeof preview.htmlUrl === "string" &&
    typeof preview.headSha === "string" &&
    /^[a-f0-9]{40}$/.test(preview.headSha) &&
    typeof preview.baseRef === "string" &&
    typeof preview.author?.login === "string"
  );
}

export function useGitHubSettlementPreview() {
  const [state, setState] = useState<PreviewState>({
    status: "idle",
    preview: null,
    error: null,
  });
  const activeRequest = useRef<AbortController | null>(null);
  const sequence = useRef(0);

  const reset = useCallback(() => {
    sequence.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = null;
    setState({ status: "idle", preview: null, error: null });
  }, []);

  const verify = useCallback(async (input: PreviewInput) => {
    sequence.current += 1;
    const requestSequence = sequence.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setState({ status: "loading", preview: null, error: null });

    try {
      const query = new URLSearchParams({
        owner: input.owner,
        repo: input.repo,
        number: String(input.number),
      });
      const response = await fetch(`/api/github/settlement-preview?${query}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw githubApiErrorFromResponse(
          response,
          null,
          "GitHub target verification returned an unreadable response.",
        );
      }
      if (!response.ok || !isPreview(payload)) {
        throw githubApiErrorFromResponse(
          response,
          payload,
          "GitHub target could not be verified.",
        );
      }
      if (requestSequence === sequence.current) {
        setState({ status: "success", preview: payload, error: null });
      }
      return payload;
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      if (requestSequence === sequence.current && error.name !== "AbortError") {
        setState({ status: "error", preview: null, error });
      }
      throw error;
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }, []);

  useEffect(() => () => activeRequest.current?.abort(), []);

  return { ...state, verify, reset };
}
