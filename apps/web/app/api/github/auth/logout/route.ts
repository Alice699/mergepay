import { clearGitHubCookies } from "@/lib/github-auth";

export async function POST(request: Request) {
  const response = Response.json(
    { authenticated: false, identity: null },
    { headers: { "Cache-Control": "no-store" } },
  );
  for (const cookie of clearGitHubCookies(request)) response.headers.append("Set-Cookie", cookie);
  return response;
}
