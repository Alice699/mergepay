import { PublicKey, deriveWorkflowPda } from "@mergepay/rialo-client";
import {
  createClaimAuthorizationCookie,
  getGitHubSession,
  getGitHubSigningSecret,
  isSameOriginMutation,
} from "@/lib/github-auth";
import { createClaimAuthorization } from "@/lib/github-claim-binding.js";
import {
  fetchPublicGitHubPull,
  GitHubPublicPullError,
  isValidGitHubPullReference,
} from "@/lib/github-public-pull";
import { webConfig } from "@/lib/config";
import { isWorkflowSlug } from "@/lib/validation";

const MAX_REQUEST_BYTES = 4_096;

interface ClaimProofRequest {
  owner?: unknown;
  repo?: unknown;
  number?: unknown;
  walletAddress?: unknown;
  targetWorkflow?: unknown;
  workflowSlug?: unknown;
}

function json(value: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function githubTelemetryHeaders(
  attempts: number,
  durationMs: number,
  failure?: string,
): Record<string, string> {
  return {
    "Server-Timing": `github;dur=${durationMs};desc="GitHub claim authorization"`,
    "X-MergePay-GitHub-Attempts": String(attempts),
    ...(failure ? { "X-MergePay-GitHub-Failure": failure } : {}),
  };
}

async function readBody(request: Request): Promise<ClaimProofRequest | null> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) return null;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) return null;
    const value = JSON.parse(body) as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as ClaimProofRequest)
      : null;
  } catch {
    return null;
  }
}

function isPublicKey(value: string): boolean {
  try {
    PublicKey.fromString(value);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  return json(
    { error: "GitHub claim verification requires an identity-, wallet-, and target-bound POST request." },
    405,
    { Allow: "POST" },
  );
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return json({ error: "Cross-origin claim authorization was blocked." }, 403);
  }

  const session = await getGitHubSession(request);
  const secret = getGitHubSigningSecret();
  if (!session || !secret) {
    return json(
      { error: "Connect GitHub again before authorizing this claim." },
      401,
    );
  }

  const body = await readBody(request);
  const owner = typeof body?.owner === "string" ? body.owner.trim() : "";
  const repo = typeof body?.repo === "string" ? body.repo.trim() : "";
  const number = Number(body?.number);
  const walletAddress =
    typeof body?.walletAddress === "string" ? body.walletAddress.trim() : "";
  const targetWorkflow =
    typeof body?.targetWorkflow === "string" ? body.targetWorkflow.trim() : "";
  const workflowSlug =
    typeof body?.workflowSlug === "string" ? body.workflowSlug.trim() : "";
  const programId = webConfig.programId;

  if (
    !body ||
    !programId ||
    !isValidGitHubPullReference(owner, repo, number) ||
    !isPublicKey(walletAddress) ||
    !isPublicKey(targetWorkflow) ||
    !isWorkflowSlug(workflowSlug)
  ) {
    return json(
      { error: "A valid pull request, wallet, target workflow, and claim nonce are required." },
      400,
    );
  }

  const claimWorkflow = deriveWorkflowPda(
    programId,
    walletAddress,
    workflowSlug,
  ).address;

  try {
    const pull = await fetchPublicGitHubPull(owner, repo, number, {
      signal: request.signal,
    });
    if (pull.author.id !== session.identity.id) {
      return json(
        { error: "The connected GitHub account did not author this pull request." },
        403,
      );
    }

    const authorization = await createClaimAuthorization(
      {
        sessionId: session.sessionId,
        githubId: session.identity.id,
        githubLogin: pull.author.login,
        walletAddress,
        targetWorkflow,
        claimWorkflow,
        workflowSlug,
        owner,
        repo,
        pullNumber: pull.number,
        programId,
        network: webConfig.network,
      },
      { secret },
    );

    const response = json(
      {
        owner,
        repo,
        number: pull.number,
        title: pull.title,
        state: pull.state,
        htmlUrl: pull.htmlUrl,
        mergedAt: pull.mergedAt,
        mergeCommitSha: pull.mergeCommitSha,
        headSha: pull.headSha,
        baseRef: pull.baseRef,
        author: pull.author,
        githubIdentity: {
          id: session.identity.id,
          login: session.identity.login,
        },
        authorization: {
          token: authorization.token,
          nonce: authorization.claims.nonce,
          expiresAt: authorization.claims.expiresAt,
          walletAddress,
          targetWorkflow,
          claimWorkflow,
          workflowSlug,
          owner,
          repo,
          pullNumber: pull.number,
          programId,
          network: webConfig.network,
        },
      },
      200,
      githubTelemetryHeaders(
        pull.upstream.attempts,
        pull.upstream.durationMs,
      ),
    );
    response.headers.append(
      "Set-Cookie",
      createClaimAuthorizationCookie(request, authorization.token),
    );
    return response;
  } catch (cause) {
    const error =
      cause instanceof GitHubPublicPullError
        ? cause
        : new GitHubPublicPullError("MergePay could not reach GitHub.", 502);
    return json(
      {
        error: error.message,
        code: error.code,
        retryable: error.retryable,
        attempts: error.attempts,
      },
      error.status,
      {
        ...githubTelemetryHeaders(error.attempts, error.durationMs, error.code),
        ...(error.retryAfterSeconds === null
          ? {}
          : { "Retry-After": String(error.retryAfterSeconds) }),
      },
    );
  }
}
