import type { MERGEPAY_INSTRUCTION_NAMES } from "./constants.js";

export type MergePayInstructionName =
  (typeof MERGEPAY_INSTRUCTION_NAMES)[number];

export type RialoNetwork = "devnet" | "testnet" | "mainnet" | "localnet";

/** A workflow nonce supplied to the generated Venus program. */
export type WorkflowSlug = string | Uint8Array;

export interface MergePayWorkflowIdentity {
  programId: string;
  sponsor: string;
  slug: WorkflowSlug;
}

export interface MergePayWorkflowState {
  /** The next async branch allocated by the Venus workflow runtime. */
  discriminator: bigint;
  /** Descriptive alias for the first Venus state field. */
  nextBranchNumber: bigint;
  /** False when the account exists but has not been initialized by create_bounty. */
  initialized: boolean;
  sponsor: string;
  beneficiary: string;
  githubOwner: string;
  githubRepo: string;
  pullNumber: bigint;
  amountKelvin: bigint;
  deadlineUnixMs: bigint;
  funded: boolean;
  mergeConfirmed: boolean;
  paid: boolean;
  refunded: boolean;
  checks: bigint;
  /** True for a contributor-owned claim record, false for the bounty record. */
  claimRequest: boolean;
  /** Sponsor-owned workflow address targeted by a claim record. */
  claimTarget: string;
  /** Canonical GitHub login returned by OAuth and shown for sponsor approval. */
  claimantGithub: string;
  /** Stable numeric GitHub user ID returned by OAuth. */
  claimantGithubId: bigint;
}

export interface MergePayDeployment {
  network: RialoNetwork;
  programId: string;
}

/** Normalized account data returned by the MergePay RPC boundary. */
export interface MergePayAccountInfo {
  address: string;
  kelvin: bigint;
  owner: string;
  data: Uint8Array;
  executable: boolean;
  rentEpoch: bigint;
  space: bigint;
}

export interface DecodedMergePayWorkflow {
  address: string;
  account: MergePayAccountInfo;
  state: MergePayWorkflowState;
}
