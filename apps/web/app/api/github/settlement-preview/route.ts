import {
  fetchPublicGitHubPull,
  GitHubPublicPullError,
  isValidGitHubPullReference,
} from "@/lib/github-public-pull";

function json(value: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function telemetryHeaders(
  attempts: number,
  durationMs: number,
  failure?: string,
): Record<string, string> {
  return {
    "Server-Timing": `github;dur=${durationMs};desc="GitHub settlement preview"`,
    "X-MergePay-GitHub-Attempts": String(attempts),
    ...(failure ? { "X-MergePay-GitHub-Failure": failure } : {}),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const owner = url.searchParams.get("owner")?.trim() ?? "";
  const repo = url.searchParams.get("repo")?.trim() ?? "";
  const number = Number(url.searchParams.get("number"));

  if (!isValidGitHubPullReference(owner, repo, number)) {
    return json(
      { error: "A valid public GitHub owner, repository, and PR number are required." },
      400,
    );
  }

  try {
    const pull = await fetchPublicGitHubPull(owner, repo, number, {
      signal: request.signal,
    });
    return json(
      {
        owner: pull.owner,
        repo: pull.repo,
        number: pull.number,
        title: pull.title,
        state: pull.state,
        htmlUrl: pull.htmlUrl,
        mergedAt: pull.mergedAt,
        mergeCommitSha: pull.mergeCommitSha,
        headSha: pull.headSha,
        baseRef: pull.baseRef,
        author: pull.author,
      },
      200,
      telemetryHeaders(pull.upstream.attempts, pull.upstream.durationMs),
    );
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
        ...telemetryHeaders(error.attempts, error.durationMs, error.code),
        ...(error.retryAfterSeconds === null
          ? {}
          : { "Retry-After": String(error.retryAfterSeconds) }),
      },
    );
  }
}
