export interface CreateBountyFormValues {
  workflowSlug: string;
  githubOwner: string;
  githubRepo: string;
  pullNumber: string;
  amountRlo: string;
  deadlineUnixMs: string;
  expectedHeadSha: string;
  expectedBaseRef: string;
  requireCiSuccess: boolean;
  minimumApprovals: string;
}

export const CREATE_BOUNTY_FIELDS = [
  "workflowSlug",
  "githubOwner",
  "githubRepo",
  "pullNumber",
  "amountRlo",
  "deadlineUnixMs",
  "expectedHeadSha",
  "expectedBaseRef",
  "requireCiSuccess",
  "minimumApprovals",
] as const satisfies ReadonlyArray<keyof CreateBountyFormValues>;
