import {
  clearGitHubCookies,
  createSessionCookie,
  getGitHubOAuthConfig,
  isValidGitHubIdentity,
  readOAuthState,
  redirectWithGitHubStatus,
  safeReturnTo,
  type GitHubIdentity,
} from "@/lib/github-auth";

const UPSTREAM_TIMEOUT_MS = 12_000;

interface GitHubTokenResponse {
  access_token?: string;
  error?: string;
}

interface GitHubProfile {
  id?: number;
  login?: string;
  avatar_url?: string | null;
  name?: string | null;
}

function errorRedirect(request: Request, returnTo: string, reason: string): Response {
  const response = redirectWithGitHubStatus(request, returnTo, "error", reason);
  for (const cookie of clearGitHubCookies(request)) response.headers.append("Set-Cookie", cookie);
  return response;
}

async function postAccessToken(
  config: NonNullable<ReturnType<typeof getGitHubOAuthConfig>>,
  code: string,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "MergePay-GitHub-OAuth/0.1",
      },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
      }),
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });
    if (!response.ok || response.status >= 300 && response.status < 400) return null;
    const payload = (await response.json()) as GitHubTokenResponse;
    return typeof payload.access_token === "string" && payload.access_token.length > 0
      ? payload.access_token
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchProfile(accessToken: string): Promise<GitHubIdentity | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "MergePay-GitHub-OAuth/0.1",
      },
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });
    if (!response.ok || response.status >= 300 && response.status < 400) return null;
    const profile = (await response.json()) as GitHubProfile;
    const identity: GitHubIdentity = {
      id: profile.id ?? 0,
      login: profile.login?.trim() ?? "",
      avatarUrl: profile.avatar_url ?? null,
      name: profile.name ?? null,
    };
    return isValidGitHubIdentity(identity) ? identity : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const incomingState = url.searchParams.get("state") ?? "";
  const state = incomingState ? await readOAuthState(request, incomingState) : null;
  const returnTo = safeReturnTo(state?.returnTo);
  const config = getGitHubOAuthConfig(request);

  if (!state || !config) return errorRedirect(request, returnTo, "invalid_oauth_state");
  if (url.searchParams.get("error")) {
    return errorRedirect(request, returnTo, "github_authorization_cancelled");
  }

  const code = url.searchParams.get("code")?.trim();
  if (!code) return errorRedirect(request, returnTo, "missing_authorization_code");

  const accessToken = await postAccessToken(config, code);
  if (!accessToken) return errorRedirect(request, returnTo, "token_exchange_failed");

  const identity = await fetchProfile(accessToken);
  if (!identity) return errorRedirect(request, returnTo, "github_profile_failed");

  const response = redirectWithGitHubStatus(request, returnTo, "connected");
  response.headers.append("Set-Cookie", await createSessionCookie(request, identity));
  const [, stateCookie] = clearGitHubCookies(request);
  if (stateCookie) response.headers.append("Set-Cookie", stateCookie);
  return response;
}
