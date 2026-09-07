export interface CreateBountyFormValues {
  workflowSlug: string;
  githubOwner: string;
  githubRepo: string;
  pullNumber: string;
  amountRlo: string;
  deadlineUnixMs: string;
}

export const CREATE_BOUNTY_FIELDS = [
  "workflowSlug",
  "githubOwner",
  "githubRepo",
  "pullNumber",
  "amountRlo",
  "deadlineUnixMs",
] as const satisfies ReadonlyArray<keyof CreateBountyFormValues>;
