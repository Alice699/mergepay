const UPSTREAM_TIMEOUT_MS = 12_000;
const GITHUB_SLUG = /^[A-Za-z0-9._-]{1,100}$/;

interface GitHubPullResponse {
  number: number;
  title: string;
  state: string;
  html_url: string;
  merged_at: string | null;
  user?: {
    id?: number;
    login?: string;
    avatar_url?: string;
  };
}

export interface PublicGitHubPull {
  owner: string;
  repo: string;
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  mergedAt: string | null;
  author: {
    id: number;
    login: string;
    avatarUrl: string | null;
  };
}

export class GitHubPublicPullError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GitHubPublicPullError";
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
): Promise<PublicGitHubPull> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "MergePay-GitHub-Proof/0.1",
        },
        cache: "no-store",
        redirect: "manual",
        signal: controller.signal,
      },
    );

    if (response.status === 404) {
      throw new GitHubPublicPullError(
        "GitHub could not find this public pull request.",
        404,
      );
    }
    if (response.status >= 300 && response.status < 400) {
      throw new GitHubPublicPullError(
        "GitHub returned an unexpected redirect.",
        502,
      );
    }
    if (!response.ok) {
      throw new GitHubPublicPullError(
        `GitHub returned HTTP ${response.status}.`,
        502,
      );
    }

    const payload = (await response.json()) as GitHubPullResponse;
    const login = payload.user?.login?.trim();
    const authorId = payload.user?.id;
    if (
      !login ||
      !Number.isSafeInteger(authorId) ||
      typeof payload.number !== "number" ||
      payload.number !== number ||
      typeof payload.title !== "string" ||
      typeof payload.state !== "string" ||
      typeof payload.html_url !== "string"
    ) {
      throw new GitHubPublicPullError(
        "GitHub returned an incomplete pull-request record.",
        502,
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
      author: {
        id: authorId as number,
        login,
        avatarUrl: payload.user?.avatar_url ?? null,
      },
    };
  } catch (cause) {
    if (cause instanceof GitHubPublicPullError) throw cause;
    throw new GitHubPublicPullError(
      cause instanceof Error && cause.name === "AbortError"
        ? "GitHub did not respond in time."
        : "MergePay could not reach GitHub.",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}
