import type { MERGEPAY_INSTRUCTION_NAMES } from "./constants";

export type MergePayInstructionName =
  (typeof MERGEPAY_INSTRUCTION_NAMES)[number];

export type RialoNetwork = "devnet" | "testnet" | "mainnet";

export interface MergePayWorkflowIdentity {
  programId: string;
  sponsor: string;
  slug: string;
}

export interface MergePayWorkflowState {
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
}

export interface MergePayDeployment {
  network: RialoNetwork;
  programId: string;
}
