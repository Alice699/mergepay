export interface CreateBountyFormValues {
  workflowSlug: string;
  beneficiary: string;
  githubOwner: string;
  githubRepo: string;
  pullNumber: string;
  amountKelvin: string;
  deadlineUnixMs: string;
}

export const CREATE_BOUNTY_FIELDS = [
  "workflowSlug",
  "beneficiary",
  "githubOwner",
  "githubRepo",
  "pullNumber",
  "amountKelvin",
  "deadlineUnixMs",
] as const satisfies ReadonlyArray<keyof CreateBountyFormValues>;
