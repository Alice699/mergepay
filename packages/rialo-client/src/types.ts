import type { MERGEPAY_INSTRUCTION_NAMES } from "./constants.js";

export type MergePayInstructionName =
  (typeof MERGEPAY_INSTRUCTION_NAMES)[number];

export type RialoNetwork = "devnet" | "testnet" | "mainnet" | "localnet";

export type MergePaySettlementProofStatus =
  | 0 // Not checked yet.
  | 1 // Pull request is not merged.
  | 2 // Pull-request head no longer matches the locked commit.
  | 3 // Pull-request base branch no longer matches the locked target.
  | 4 // Required CI is missing, pending, or unsuccessful.
  | 5 // Required current-commit approvals are missing.
  | 6 // Every locked condition passed.
  | 7; // REX report was unavailable, malformed, or not unanimous.

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
  /** Exact pull-request head commit locked when the bounty is created. */
  expectedHeadSha: string;
  /** Exact pull-request base branch locked when the bounty is created. */
  expectedBaseRef: string;
  /** Whether at least one CI signal and every latest signal must pass. */
  requireCiSuccess: boolean;
  /** Required writer approvals attached to the exact locked head commit. */
  minimumApprovals: bigint;
  /** Last strong settlement-proof result persisted by the Rialo program. */
  proofStatus: MergePaySettlementProofStatus;
  proofHeadSha: string;
  proofBaseRef: string;
  proofMergeCommitSha: string;
  proofCiSuccess: boolean;
  proofApprovals: bigint;
  proofCheckedUnixMs: bigint;
  /** Account containing the immutable custom REX WASM verifier. */
  rexBytecodeAccount: string;
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
