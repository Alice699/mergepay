import {
  BoundedRetryError,
  parseRetryAfterMs,
  retryAfterSeconds,
  runWithBoundedRetry,
} from "@/lib/upstream-reliability";

const UPSTREAM_ATTEMPT_TIMEOUT_MS = 7_000;
const UPSTREAM_MAX_ATTEMPTS = 2;
const MAX_RESPONSE_BYTES = 1_000_000;
const GITHUB_SLUG = /^[A-Za-z0-9._-]{1,100}$/;
const RETRYABLE_GITHUB_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

interface GitHubPullResponse {
  number: number;
  title: string;
  state: string;
  html_url: string;
  merged_at: string | null;
  merge_commit_sha?: string | null;
  head?: {
    sha?: string;
  };
  base?: {
    ref?: string;
  };
  user?: {
    id?: number;
    login?: string;
    avatar_url?: string;
  };
}

interface GitHubUpstreamResponse {
  status: number;
  body: string;
  retryAfterMs: number | null;
  rateLimited: boolean;
}

export type GitHubPublicPullErrorCode =
  | "GITHUB_PULL_NOT_FOUND"
  | "GITHUB_RATE_LIMITED"
  | "GITHUB_TIMEOUT"
  | "GITHUB_UNAVAILABLE"
  | "GITHUB_FORBIDDEN"
  | "GITHUB_INVALID_RESPONSE";

export interface PublicGitHubPull {
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
  upstream: {
    attempts: number;
    durationMs: number;
  };
}

export interface FetchPublicGitHubPullOptions {
  signal?: AbortSignal;
  maxAttempts?: number;
  fetch?: typeof fetch;
  sleep?: (durationMs: number, signal?: AbortSignal) => Promise<void>;
}

export class GitHubPublicPullError extends Error {
  readonly durationMs: number;

  constructor(
    message: string,
    readonly status: number,
    readonly code: GitHubPublicPullErrorCode = "GITHUB_UNAVAILABLE",
    readonly retryable = false,
    readonly attempts = 1,
    readonly retryAfterSeconds: number | null = null,
    options?: ErrorOptions & { durationMs?: number },
  ) {
    super(message, options);
    this.name = "GitHubPublicPullError";
    this.durationMs = options?.durationMs ?? 0;
  }
}

export function isValidGitHubPullReference(
  owner: string,
  repo: string,
  number: number,
): boolean {
  return (
    GITHUB_SLUG.test(owner) &&
    GITHUB_SLUG.test(repo) &&
    Number.isSafeInteger(number) &&
    number > 0
  );
}

export async function fetchPublicGitHubPull(
  owner: string,
  repo: string,
  number: number,
  options: FetchPublicGitHubPullOptions = {},
): Promise<PublicGitHubPull> {
  const fetchUpstream = options.fetch ?? fetch;
  let result;
  try {
    result = await runWithBoundedRetry<GitHubUpstreamResponse>({
      maxAttempts: options.maxAttempts ?? UPSTREAM_MAX_ATTEMPTS,
      timeoutMs: UPSTREAM_ATTEMPT_TIMEOUT_MS,
      baseDelayMs: 200,
      maxDelayMs: 1_000,
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.sleep ? { sleep: options.sleep } : {}),
      operation: async ({ signal }) => {
        const response = await fetchUpstream(
          `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}`,
          {
            headers: {
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
              "User-Agent": "MergePay-GitHub-Proof/0.1",
            },
            cache: "no-store",
            redirect: "manual",
            signal,
          },
        );
        const retryAfterMs = githubRetryAfterMs(response.headers);
        return {
          status: response.status,
          body: await response.text(),
          retryAfterMs,
          rateLimited:
            response.status === 429 ||
            (response.status === 403 &&
              response.headers.get("x-ratelimit-remaining") === "0"),
        };
      },
      shouldRetry: (response) => ({
        retry:
          response.rateLimited ||
          RETRYABLE_GITHUB_STATUSES.has(response.status),
        ...(response.retryAfterMs === null
          ? {}
          : { delayMs: response.retryAfterMs }),
      }),
    });
  } catch (cause) {
    const retryError = cause instanceof BoundedRetryError ? cause : null;
    const timedOut = retryError?.timedOut === true;
    throw new GitHubPublicPullError(
      timedOut
        ? "GitHub did not respond before the verification timeout. Approval remains locked; try again shortly."
        : "MergePay could not reach GitHub. Approval remains locked until GitHub is reachable.",
      timedOut ? 504 : 503,
      timedOut ? "GITHUB_TIMEOUT" : "GITHUB_UNAVAILABLE",
      true,
      retryError?.attempts ?? 1,
      2,
      {
        cause: cause instanceof Error ? cause : undefined,
        durationMs: retryError?.durationMs ?? 0,
      },
    );
  }

  const upstream = result.value;
  const attempts = result.attempts;
  const retryAfter = retryAfterSeconds(upstream.retryAfterMs);
  if (upstream.status === 404) {
    throw new GitHubPublicPullError(
      "GitHub could not find this public pull request.",
      404,
      "GITHUB_PULL_NOT_FOUND",
      false,
      attempts,
      null,
      { durationMs: result.durationMs },
    );
  }
  if (upstream.rateLimited) {
    throw new GitHubPublicPullError(
      "GitHub rate limiting temporarily prevented verification. Approval remains locked; retry after the limit resets.",
      429,
      "GITHUB_RATE_LIMITED",
      true,
      attempts,
      retryAfter,
      { durationMs: result.durationMs },
    );
  }
  if (upstream.status >= 300 && upstream.status < 400) {
    throw new GitHubPublicPullError(
      "GitHub returned an unexpected redirect, so MergePay did not trust the response.",
      502,
      "GITHUB_INVALID_RESPONSE",
      false,
      attempts,
      null,
      { durationMs: result.durationMs },
    );
  }
  if (upstream.status === 403 || upstream.status === 401) {
    throw new GitHubPublicPullError(
      "GitHub denied access to this pull-request record.",
      403,
      "GITHUB_FORBIDDEN",
      false,
      attempts,
      null,
      { durationMs: result.durationMs },
    );
  }
  if (upstream.status >= 500 || RETRYABLE_GITHUB_STATUSES.has(upstream.status)) {
    throw new GitHubPublicPullError(
      "GitHub is temporarily unavailable. Approval remains locked; try again shortly.",
      503,
      "GITHUB_UNAVAILABLE",
      true,
      attempts,
      retryAfter,
      { durationMs: result.durationMs },
    );
  }
  if (upstream.status < 200 || upstream.status >= 300) {
    throw new GitHubPublicPullError(
      `GitHub returned an unsupported HTTP ${upstream.status} response.`,
      502,
      "GITHUB_INVALID_RESPONSE",
      false,
      attempts,
      null,
      { durationMs: result.durationMs },
    );
  }
  if (new TextEncoder().encode(upstream.body).byteLength > MAX_RESPONSE_BYTES) {
    throw new GitHubPublicPullError(
      "GitHub returned an oversized pull-request record.",
      502,
      "GITHUB_INVALID_RESPONSE",
      false,
      attempts,
      null,
      { durationMs: result.durationMs },
    );
  }

  let payload: GitHubPullResponse;
  try {
    payload = JSON.parse(upstream.body) as GitHubPullResponse;
  } catch (cause) {
    throw new GitHubPublicPullError(
      "GitHub returned an unreadable pull-request record.",
      502,
      "GITHUB_INVALID_RESPONSE",
      false,
      attempts,
      null,
      {
        cause: cause instanceof Error ? cause : undefined,
        durationMs: result.durationMs,
      },
    );
  }

  const login = payload.user?.login?.trim();
  const authorId = payload.user?.id;
  const headSha = payload.head?.sha?.trim().toLowerCase();
  const baseRef = payload.base?.ref?.trim();
  const mergeCommitSha = payload.merge_commit_sha?.trim().toLowerCase() || null;
  if (
    !login ||
    !Number.isSafeInteger(authorId) ||
    typeof payload.number !== "number" ||
    payload.number !== number ||
    typeof payload.title !== "string" ||
    typeof payload.state !== "string" ||
    typeof payload.html_url !== "string" ||
    !headSha ||
    !/^[a-f0-9]{40}$/.test(headSha) ||
    !baseRef ||
    baseRef.length > 128 ||
    baseRef.startsWith("/") ||
    baseRef.endsWith("/") ||
    baseRef.includes("..") ||
    !/^[A-Za-z0-9._/-]+$/.test(baseRef) ||
    (mergeCommitSha !== null && !/^[a-f0-9]{40}$/.test(mergeCommitSha))
  ) {
    throw new GitHubPublicPullError(
      "GitHub returned an incomplete pull-request record.",
      502,
      "GITHUB_INVALID_RESPONSE",
      false,
      attempts,
      null,
      { durationMs: result.durationMs },
    );
  }

  return {
    owner,
    repo,
    number: payload.number,
    title: payload.title,
    state: payload.state,
    htmlUrl: payload.html_url,
    mergedAt: payload.merged_at,
    mergeCommitSha,
    headSha,
    baseRef,
    author: {
      id: authorId as number,
      login,
      avatarUrl: payload.user?.avatar_url ?? null,
    },
    upstream: {
      attempts,
      durationMs: result.durationMs,
    },
  };
}

function githubRetryAfterMs(headers: Headers): number | null {
  const explicit = parseRetryAfterMs(headers.get("retry-after"));
  if (explicit !== null) return explicit;
  if (headers.get("x-ratelimit-remaining") !== "0") return null;

  const resetSeconds = Number(headers.get("x-ratelimit-reset"));
  return Number.isFinite(resetSeconds)
    ? Math.max(0, Math.round(resetSeconds * 1_000 - Date.now()))
    : null;
}
