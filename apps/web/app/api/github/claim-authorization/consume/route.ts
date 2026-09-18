import {
  clearClaimAuthorizationCookie,
  getGitHubSession,
  getGitHubSigningSecret,
  isSameOriginMutation,
  readClaimAuthorizationCookie,
} from "@/lib/github-auth";
import {
  ClaimAuthorizationError,
  constantTimeEqual,
  verifyClaimAuthorization,
} from "@/lib/github-claim-binding.js";
import { webConfig } from "@/lib/config";

const MAX_REQUEST_BYTES = 12_000;

interface ConsumeRequest {
  token?: unknown;
  walletAddress?: unknown;
  targetWorkflow?: unknown;
  claimWorkflow?: unknown;
  workflowSlug?: unknown;
  owner?: unknown;
  repo?: unknown;
  pullNumber?: unknown;
}

function json(request: Request, value: unknown, status: number, clear = false) {
  const response = Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
  if (clear) {
    response.headers.append("Set-Cookie", clearClaimAuthorizationCookie(request));
  }
  return response;
}

async function readBody(request: Request): Promise<ConsumeRequest | null> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) return null;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) return null;
    const value = JSON.parse(body) as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as ConsumeRequest)
      : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return json(request, { error: "Cross-origin claim consumption was blocked." }, 403, true);
  }

  const session = await getGitHubSession(request);
  const secret = getGitHubSigningSecret();
  const cookieToken = readClaimAuthorizationCookie(request);
  const body = await readBody(request);
  const token = typeof body?.token === "string" ? body.token : "";
  const programId = webConfig.programId;

  if (
    !session ||
    !secret ||
    !programId ||
    !cookieToken ||
    !token ||
    !constantTimeEqual(cookieToken, token)
  ) {
    return json(
      request,
      { error: "The claim authorization is missing or was already consumed. Verify the pull request again." },
      401,
      true,
    );
  }

  const expected = {
    sessionId: session.sessionId,
    githubId: session.identity.id,
    walletAddress: typeof body?.walletAddress === "string" ? body.walletAddress : "",
    targetWorkflow: typeof body?.targetWorkflow === "string" ? body.targetWorkflow : "",
    claimWorkflow: typeof body?.claimWorkflow === "string" ? body.claimWorkflow : "",
    workflowSlug: typeof body?.workflowSlug === "string" ? body.workflowSlug : "",
    owner: typeof body?.owner === "string" ? body.owner : "",
    repo: typeof body?.repo === "string" ? body.repo : "",
    pullNumber: Number(body?.pullNumber),
    programId,
    network: webConfig.network,
  };

  try {
    const claims = await verifyClaimAuthorization(token, expected, { secret });
    return json(
      request,
      {
        authorized: true,
        identity: {
          id: claims.githubId,
          login: claims.githubLogin,
        },
        binding: {
          walletAddress: claims.walletAddress,
          targetWorkflow: claims.targetWorkflow,
          claimWorkflow: claims.claimWorkflow,
          workflowSlug: claims.workflowSlug,
          owner: claims.owner,
          repo: claims.repo,
          pullNumber: claims.pullNumber,
          programId: claims.programId,
          network: claims.network,
        },
        nonce: claims.nonce,
        expiresAt: claims.expiresAt,
      },
      200,
      true,
    );
  } catch (cause) {
    const code =
      cause instanceof ClaimAuthorizationError
        ? cause.code
        : "CLAIM_AUTHORIZATION_INVALID";
    const message =
      cause instanceof Error
        ? cause.message
        : "The claim authorization could not be verified.";
    return json(request, { error: message, code }, 403, true);
  }
}
