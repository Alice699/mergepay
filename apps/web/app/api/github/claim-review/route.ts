import {
  fetchPublicGitHubPull,
  GitHubPublicPullError,
  isValidGitHubPullReference,
} from "@/lib/github-public-pull";

const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const GITHUB_ID = /^\d{1,20}$/;

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
    "Server-Timing": `github;dur=${durationMs};desc="GitHub claim review"`,
    "X-MergePay-GitHub-Attempts": String(attempts),
    ...(failure ? { "X-MergePay-GitHub-Failure": failure } : {}),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const owner = url.searchParams.get("owner")?.trim() ?? "";
  const repo = url.searchParams.get("repo")?.trim() ?? "";
  const number = Number(url.searchParams.get("number"));
  const claimantIdValue = url.searchParams.get("claimantId")?.trim() ?? "";
  const claimantLogin = url.searchParams.get("claimantLogin")?.trim() ?? "";

  if (
    !isValidGitHubPullReference(owner, repo, number) ||
    !GITHUB_ID.test(claimantIdValue) ||
    !GITHUB_LOGIN.test(claimantLogin)
  ) {
    return json(
      {
        error:
          "A valid public pull request and recorded contributor identity are required.",
      },
      400,
    );
  }

  const claimantId = BigInt(claimantIdValue);
  if (claimantId < 1n || claimantId > BigInt(Number.MAX_SAFE_INTEGER)) {
    return json({ error: "The recorded GitHub user ID is outside the supported range." }, 400);
  }

  try {
    const pull = await fetchPublicGitHubPull(owner, repo, number, {
      signal: request.signal,
    });
    const authorIdMatches = BigInt(pull.author.id) === claimantId;
    const recordedLoginMatches =
      pull.author.login.toLowerCase() === claimantLogin.toLowerCase();

    return json(
      {
        target: {
          owner: pull.owner,
          repo: pull.repo,
          number: pull.number,
          title: pull.title,
          state: pull.state,
          htmlUrl: pull.htmlUrl,
          mergedAt: pull.mergedAt,
        },
        claim: {
          githubId: claimantId.toString(),
          githubLogin: claimantLogin,
        },
        author: pull.author,
        verification: {
          authorIdMatches,
          recordedLoginMatches,
        },
      },
      200,
      githubTelemetryHeaders(
        pull.upstream.attempts,
        pull.upstream.durationMs,
      ),
    );
  } catch (cause) {
    const error =
      cause instanceof GitHubPublicPullError
        ? cause
        : new GitHubPublicPullError("MergePay could not verify this pull request.", 502);
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
