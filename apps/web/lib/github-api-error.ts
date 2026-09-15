export interface GitHubApiErrorPayload {
  error?: string;
  code?: string;
  retryable?: boolean;
  attempts?: number;
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly retryable: boolean,
    readonly attempts: number,
    readonly retryAfterSeconds: number | null,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export function githubApiErrorFromResponse(
  response: Response,
  payload: unknown,
  fallback: string,
): GitHubApiError {
  const details = isGitHubApiErrorPayload(payload) ? payload : {};
  const retryAfter = Number(response.headers.get("retry-after"));
  return new GitHubApiError(
    details.error?.trim() || fallback,
    response.status,
    details.code?.trim() || null,
    details.retryable === true,
    Number.isSafeInteger(details.attempts) && (details.attempts ?? 0) > 0
      ? details.attempts as number
      : 1,
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
  );
}

function isGitHubApiErrorPayload(value: unknown): value is GitHubApiErrorPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
