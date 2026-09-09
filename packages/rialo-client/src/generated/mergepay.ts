/**
 * Generated protocol constants for the current MergePay Venus interface candidate.
 *
 * The values mirror programs/mergepay-rialo/wit/mergepay-rialo-manifest.json
 * and the current marketplace deployment recorded in deployments/devnet.json.
 * The source candidate uses one native settlement heartbeat: it polls GitHub
 * on a bounded cadence and refunds from the same heartbeat after the deadline.
 * Keep protocol values here so UI code never has to duplicate ABI details.
 */

export const MERGEPAY_MANIFEST_VERSION = "1.1" as const;

/** Current DevNet marketplace program; full claim and settlement E2E is still pending. */
export const MERGEPAY_PROGRAM_ID =
  "Gdbcab4Wn5zyUYAP8C7MZzWtfbsVpYX3k6FuhnY5Dbe3" as const;

export const MERGEPAY_WELL_KNOWN_ADDRESSES = {
  systemProgram: "11111111111111111111111111111111",
  subscriberInterface: "Subscriber111111111111111111111111111111111",
  rexRegistry: "Qrac1eRegistry11111111111111111111111111111",
  rexProcessor: "Qrac1eProcessor1111111111111111111111111111",
} as const;

/**
 * Initiating instruction discriminants from the public manifest.
 *
 * `check_merge` is retained as the public ABI name used by the UI, while its
 * wire instruction invokes the generated `run_merge_check` handler callback.
 */
export const MERGEPAY_INSTRUCTION_DISCRIMINANTS = {
  status: 0,
  fund: 1,
  check_merge: 2,
  create_bounty: 4,
  request_claim: 5,
  accept_claim: 6,
  refund: 8,
} as const;

/** `run_merge_check` callback discriminant. */
export const MERGEPAY_CALLBACK_DISCRIMINANT = 7;
export const MERGEPAY_TIMER_CALLBACK_DISCRIMINANT = 7;

/**
 * Account indexes used by the generated Venus constructors.
 *
 * `fund` installs the initial settlement heartbeat, while `run_merge_check`
 * owns a second timer subscription in addition to its REX response subscription.
 */
export const MERGEPAY_ACCOUNT_INDEXES = {
  payer: 0,
  workflowPda: 1,
  fundSubscriptionPda: 4,
  requestClaimTarget: 4,
  acceptClaimWorkflow: 4,
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
