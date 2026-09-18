import { githubApiErrorFromResponse } from "@/lib/github-api-error";

export interface GitHubClaimAuthorization {
  token: string;
  nonce: string;
  expiresAt: number;
  walletAddress: string;
  targetWorkflow: string;
  claimWorkflow: string;
  workflowSlug: string;
  owner: string;
  repo: string;
  pullNumber: number;
  programId: string;
  network: string;
}

export interface ConsumedGitHubClaimAuthorization {
  authorized: true;
  identity: {
    id: number;
    login: string;
  };
  binding: Omit<GitHubClaimAuthorization, "token" | "nonce" | "expiresAt">;
  nonce: string;
  expiresAt: number;
}

function isConsumedAuthorization(
  value: unknown,
): value is ConsumedGitHubClaimAuthorization {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ConsumedGitHubClaimAuthorization>;
  return (
    candidate.authorized === true &&
    Number.isSafeInteger(candidate.identity?.id) &&
    typeof candidate.identity?.login === "string" &&
    typeof candidate.binding?.walletAddress === "string" &&
    typeof candidate.binding.targetWorkflow === "string" &&
    typeof candidate.binding.claimWorkflow === "string" &&
    typeof candidate.binding.workflowSlug === "string" &&
    typeof candidate.binding.owner === "string" &&
    typeof candidate.binding.repo === "string" &&
    Number.isSafeInteger(candidate.binding.pullNumber) &&
    typeof candidate.binding.programId === "string" &&
    typeof candidate.binding.network === "string" &&
    typeof candidate.nonce === "string" &&
    Number.isSafeInteger(candidate.expiresAt)
  );
}

export async function consumeGitHubClaimAuthorization(
  authorization: GitHubClaimAuthorization,
  signal?: AbortSignal,
): Promise<ConsumedGitHubClaimAuthorization> {
  const response = await fetch("/api/github/claim-authorization/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: authorization.token,
      walletAddress: authorization.walletAddress,
      targetWorkflow: authorization.targetWorkflow,
      claimWorkflow: authorization.claimWorkflow,
      workflowSlug: authorization.workflowSlug,
      owner: authorization.owner,
      repo: authorization.repo,
      pullNumber: authorization.pullNumber,
    }),
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
      "The GitHub claim authorization returned an unreadable response.",
    );
  }
  if (!response.ok || !isConsumedAuthorization(payload)) {
    throw githubApiErrorFromResponse(
      response,
      payload,
      "The GitHub claim authorization is no longer valid. Verify the pull request again.",
    );
  }
  return payload;
}
