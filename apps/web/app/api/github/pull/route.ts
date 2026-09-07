import { getGitHubIdentity } from "@/lib/github-auth";

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

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const identity = await getGitHubIdentity(request);
  if (!identity) {
    return json(
      { error: "Connect GitHub before verifying that you authored this pull request." },
      401,
    );
  }

  const url = new URL(request.url);
  const owner = url.searchParams.get("owner")?.trim() ?? "";
  const repo = url.searchParams.get("repo")?.trim() ?? "";
  const number = Number(url.searchParams.get("number"));

  if (
    !GITHUB_SLUG.test(owner) ||
    !GITHUB_SLUG.test(repo) ||
    !Number.isSafeInteger(number) ||
    number < 1
  ) {
    return json({ error: "A valid public GitHub owner, repository, and PR number are required." }, 400);
  }

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
      return json({ error: "GitHub could not find this public pull request." }, 404);
    }
    if (response.status >= 300 && response.status < 400) {
      return json({ error: "GitHub returned an unexpected redirect." }, 502);
    }
    if (!response.ok) {
      return json({ error: `GitHub returned HTTP ${response.status}.` }, 502);
    }

    const payload = (await response.json()) as GitHubPullResponse;
    const login = payload.user?.login?.trim();
    const authorId = payload.user?.id;
    if (!login || !Number.isSafeInteger(authorId) || typeof payload.number !== "number") {
      return json({ error: "GitHub returned an incomplete pull-request record." }, 502);
    }
    if (authorId !== identity.id) {
      return json(
        { error: "The connected GitHub account did not author this pull request." },
        403,
      );
    }

    return json({
      owner,
      repo,
      number: payload.number,
      title: payload.title,
      state: payload.state,
      htmlUrl: payload.html_url,
      mergedAt: payload.merged_at,
      author: {
        id: authorId,
        login,
        avatarUrl: payload.user?.avatar_url ?? null,
      },
      githubIdentity: {
        id: identity.id,
        login: identity.login,
      },
    });
  } catch (cause) {
    return json(
      {
        error:
          cause instanceof Error && cause.name === "AbortError"
            ? "GitHub did not respond in time."
            : "MergePay could not reach GitHub.",
      },
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}
