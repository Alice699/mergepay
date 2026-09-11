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
  const payload = (await response.json()) as unknown;

  if (!response.ok || !isGitHubClaimReview(payload)) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "GitHub could not verify the recorded contributor.";
    throw new Error(message);
  }

  return payload;
}
