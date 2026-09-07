import { getGitHubIdentity, isGitHubOAuthConfigured } from "@/lib/github-auth";

export async function GET(request: Request) {
  const identity = await getGitHubIdentity(request);
  return Response.json(
    {
      configured: isGitHubOAuthConfigured(),
      authenticated: Boolean(identity),
      identity,
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
