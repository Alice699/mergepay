import {
  createOAuthStateCookie,
  getGitHubOAuthConfig,
  safeReturnTo,
} from "@/lib/github-auth";

function json(value: unknown, status: number) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  const config = getGitHubOAuthConfig(request);
  if (!config) {
    return json(
      {
        error:
          "GitHub sign-in is not configured. Add the OAuth client and session secret before enabling contributor claims.",
      },
      503,
    );
  }

  const state = crypto.randomUUID();
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: "read:user",
    state,
    allow_signup: "false",
  }).toString();

  const response = new Response(null, {
    status: 302,
    headers: { Location: authorizeUrl.toString() },
  });
  response.headers.append(
    "Set-Cookie",
    await createOAuthStateCookie(request, state, returnTo),
  );
  return response;
}
