import { githubApiErrorFromResponse } from "@/lib/github-api-error";

export interface GitHubClaimReviewInput {
  owner: string;
  repo: string;
  number: bigint | number;
  claimantGithubId: bigint;
  claimantGithubLogin: string;
}

export interface GitHubClaimReview {
  target: {
    owner: string;
    repo: string;
    number: number;
    title: string;
    state: string;
    htmlUrl: string;
    mergedAt: string | null;
  };
  claim: {
    githubId: string;
    githubLogin: string;
  };
  author: {
    id: number;
    login: string;
    avatarUrl: string | null;
  };
  verification: {
    authorIdMatches: boolean;
    recordedLoginMatches: boolean;
  };
}

function isGitHubClaimReview(value: unknown): value is GitHubClaimReview {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<GitHubClaimReview>;
  return (
    typeof candidate.target?.owner === "string" &&
    typeof candidate.target.repo === "string" &&
    Number.isSafeInteger(candidate.target.number) &&
    typeof candidate.target.title === "string" &&
    typeof candidate.target.htmlUrl === "string" &&
    typeof candidate.claim?.githubId === "string" &&
    typeof candidate.claim.githubLogin === "string" &&
    Number.isSafeInteger(candidate.author?.id) &&
    typeof candidate.author?.login === "string" &&
    typeof candidate.verification?.authorIdMatches === "boolean" &&
    typeof candidate.verification.recordedLoginMatches === "boolean"
  );
}

export async function verifyGitHubClaimAuthor(
  input: GitHubClaimReviewInput,
  signal?: AbortSignal,
): Promise<GitHubClaimReview> {
  const query = new URLSearchParams({
    owner: input.owner,
    repo: input.repo,
    number: String(input.number),
    claimantId: input.claimantGithubId.toString(),
    claimantLogin: input.claimantGithubLogin,
  });
  const response = await fetch(`/api/github/claim-review?${query.toString()}`, {
    cache: "no-store",
    signal: signal ?? null,
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw githubApiErrorFromResponse(
      response,
      null,
      "GitHub contributor verification returned an unreadable response.",
    );
  }

  if (!response.ok || !isGitHubClaimReview(payload)) {
    throw githubApiErrorFromResponse(
      response,
      payload,
      "GitHub could not verify the recorded contributor.",
    );
  }

  return payload;
}
