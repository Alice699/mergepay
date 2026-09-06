/**
 * Generated protocol constants for the deployed MergePay Venus interface.
 *
 * The values mirror programs/mergepay-rialo/wit/mergepay-rialo-manifest.json
 * and the runtime-proven deployment recorded in deployments/devnet.json.
 * Keep protocol values here so UI code never has to duplicate ABI details.
 */

export const MERGEPAY_MANIFEST_VERSION = "1.1" as const;

/** Hardened MergePay program currently deployed and runtime-proven on Rialo DevNet. */
export const MERGEPAY_PROGRAM_ID =
  "6QHxmfBi9DEhrcdg65c87Hp9H5Ny3xSTCT4b9vaDTsFB" as const;

export const MERGEPAY_WELL_KNOWN_ADDRESSES = {
  systemProgram: "11111111111111111111111111111111",
  subscriberInterface: "Subscriber111111111111111111111111111111111",
  rexRegistry: "Qrac1eRegistry11111111111111111111111111111",
  rexProcessor: "Qrac1eProcessor1111111111111111111111111111",
} as const;

/**
 * Initiating instruction discriminants from the public manifest.
 *
 * The handler variant is internal to the generated program and is not part of
 * the external initiating ABI. That is why check_merge is discriminant 2.
 */
export const MERGEPAY_INSTRUCTION_DISCRIMINANTS = {
  status: 0,
  fund: 1,
  check_merge: 2,
  refund: 4,
  create_bounty: 5,
} as const;

export const MERGEPAY_CALLBACK_DISCRIMINANT = 3;

/** Account indexes used by the generated check_merge constructor. */
export const MERGEPAY_ACCOUNT_INDEXES = {
  payer: 0,
  workflowPda: 1,
  rexRegistry: 2,
  systemProgram: 3,
  subscriberInterface: 4,
  subscriptionPda: 5,
  rexPda: 6,
} as const;

export const MERGEPAY_SEEDS = {
  workflow: "rialo_workflow",
  subscription: "rialo_subscribe",
  rex: "rex_info",
  eventData: "rex_report",
} as const;

/** The framework manifest's declared minimum workflow account size. */
export const MERGEPAY_WORKFLOW_STATE_MIN_SIZE = 256;
