/**
 * Generated protocol constants for the current MergePay Venus interface candidate.
 *
 * The values mirror programs/mergepay-rialo/wit/mergepay-rialo-manifest.json
 * and the current marketplace deployment recorded in deployments/devnet.json.
 * The current source candidate uses one native settlement heartbeat and a
 * custom REX WASM verifier for exact GitHub revision and policy evidence.
 * Keep protocol values here so UI code never has to duplicate ABI details.
 */

export const MERGEPAY_MANIFEST_VERSION = "1.1" as const;

/** Current DevNet marketplace program; live payout/refund E2E is tracked separately. */
export const MERGEPAY_PROGRAM_ID =
  "Amf1rCvjvMpKKwQNTwsbQUm7fZkhNP9wdwfVhEPw12Zx" as const;

export const MERGEPAY_WELL_KNOWN_ADDRESSES = {
  systemProgram: "11111111111111111111111111111111",
  subscriberInterface: "Subscriber111111111111111111111111111111111",
  rexRegistry: "Qrac1eRegistry11111111111111111111111111111",
  rexProcessor: "Qrac1eProcessor1111111111111111111111111111",
} as const;

/**
 * Initiating instruction discriminants from the public manifest.
 *
 * `check_merge` is the public control ABI used by the UI. It resets the
 * settlement throttle and arms a fresh native-timer `run_merge_check` branch.
 */
export const MERGEPAY_INSTRUCTION_DISCRIMINANTS = {
  status: 0,
  create_bounty: 1,
  request_claim: 2,
  fund: 3,
  accept_claim: 4,
  check_merge: 5,
  prepare_funding: 7,
  refund: 9,
} as const;

/** `run_merge_check` callback discriminant. */
export const MERGEPAY_CALLBACK_DISCRIMINANT = 8;
export const MERGEPAY_TIMER_CALLBACK_DISCRIMINANT = 8;

/**
 * Account indexes used by the generated Venus constructors.
 *
 * `prepare_funding` grows storage before `fund` locks the escrow. The public
 * `check_merge` control call uses `fundSubscriptionPda` (index 4); each
 * `run_merge_check` callback owns later timer and REX subscriptions.
 */
export const MERGEPAY_ACCOUNT_INDEXES = {
  payer: 0,
  workflowPda: 1,
  fundSubscriptionPda: 4,
  requestClaimTarget: 3,
  acceptClaimWorkflow: 3,
  rexRegistry: 2,
  systemProgram: 3,
  subscriberInterface: 4,
  subscriptionPda: 5,
  retrySubscriptionPda: 6,
  rexPda: 7,
} as const;

export const MERGEPAY_SEEDS = {
  workflow: "rialo_workflow",
  subscription: "rialo_subscribe",
  rex: "rex_info",
  eventData: "rex_report",
} as const;

/** The framework manifest's declared minimum workflow account size. */
export const MERGEPAY_WORKFLOW_STATE_MIN_SIZE = 256;
