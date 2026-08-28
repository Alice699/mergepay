export const WORKFLOW_SLUG_HEX_LENGTH = 64;

export const routes = {
  home: "/",
  bounties: "/bounties",
  createBounty: "/bounties/new",
  activity: "/activity",
  docs: "/docs",
  bounty: (slug: string) => `/bounties/${encodeURIComponent(slug)}`,
} as const;
