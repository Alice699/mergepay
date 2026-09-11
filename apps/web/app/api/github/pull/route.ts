import { getGitHubIdentity } from "@/lib/github-auth";
import {
  fetchPublicGitHubPull,
  GitHubPublicPullError,
  isValidGitHubPullReference,
} from "@/lib/github-public-pull";

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

  if (!isValidGitHubPullReference(owner, repo, number)) {
    return json({ error: "A valid public GitHub owner, repository, and PR number are required." }, 400);
  }

  try {
    const pull = await fetchPublicGitHubPull(owner, repo, number);
    if (pull.author.id !== identity.id) {
      return json(
        { error: "The connected GitHub account did not author this pull request." },
        403,
      );
    }

    return json({
      owner,
      repo,
      number: pull.number,
      title: pull.title,
      state: pull.state,
      htmlUrl: pull.htmlUrl,
      mergedAt: pull.mergedAt,
      author: pull.author,
      githubIdentity: {
        id: identity.id,
        login: identity.login,
      },
    });
  } catch (cause) {
    const error =
      cause instanceof GitHubPublicPullError
        ? cause
        : new GitHubPublicPullError("MergePay could not reach GitHub.", 502);
    return json({ error: error.message }, error.status);
  }
}
