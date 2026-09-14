import { MERGEPAY_UNASSIGNED_BENEFICIARY } from "./constants.js";
import type {
  DecodedMergePayWorkflow,
  MergePayWorkflowState,
} from "./types.js";

export type MergePayWorkflowLifecycle =
  | "uninitialized"
  | "claim_request"
  | "created"
  | "claimed"
  | "funded"
  | "merge_confirmed"
  | "paid"
  | "refunded"
  | "invalid";

/**
 * Classifies only combinations that the MergePay program can legitimately
 * persist. Invalid combinations must never be promoted to a user-facing
 * settlement or marketplace status.
 */
export function classifyWorkflowLifecycle(
  state: MergePayWorkflowState,
): MergePayWorkflowLifecycle {
  if (!state.initialized) return "uninitialized";

  if (
    (state.paid && state.refunded) ||
    (state.paid && (!state.funded || !state.mergeConfirmed)) ||
    (state.refunded && (!state.funded || state.mergeConfirmed)) ||
    (state.mergeConfirmed && !state.funded) ||
    ((state.funded || state.mergeConfirmed || state.paid || state.refunded) &&
      state.beneficiary === MERGEPAY_UNASSIGNED_BENEFICIARY)
  ) {
    return "invalid";
  }

  if (state.claimRequest) {
    return !state.funded &&
      !state.mergeConfirmed &&
      !state.paid &&
      !state.refunded &&
      state.beneficiary !== MERGEPAY_UNASSIGNED_BENEFICIARY &&
      state.claimTarget !== MERGEPAY_UNASSIGNED_BENEFICIARY
      ? "claim_request"
      : "invalid";
  }

  if (state.paid) return "paid";
  if (state.refunded) return "refunded";
  if (state.mergeConfirmed) return "merge_confirmed";
  if (state.funded) return "funded";
  return state.beneficiary === MERGEPAY_UNASSIGNED_BENEFICIARY
    ? "created"
    : "claimed";
}

/**
 * Rejects a stale or identity-mutated account snapshot while allowing polling
 * to skip intermediate states (for example, claimed directly to paid).
 */
export function isWorkflowSnapshotProgression(
  previous: DecodedMergePayWorkflow | null,
  incoming: DecodedMergePayWorkflow,
): boolean {
  const after = incoming.state;
  const afterLifecycle = classifyWorkflowLifecycle(after);
  if (afterLifecycle === "invalid" || afterLifecycle === "uninitialized") {
    return false;
  }
  if (previous === null) return true;
  if (
    previous.address !== incoming.address ||
    previous.account.owner !== incoming.account.owner
  ) {
    return false;
  }

  const before = previous.state;
  const beforeLifecycle = classifyWorkflowLifecycle(before);
  if (beforeLifecycle === "invalid") return false;
  if (beforeLifecycle === "uninitialized") return true;

  if (
    before.sponsor !== after.sponsor ||
    before.githubOwner !== after.githubOwner ||
    before.githubRepo !== after.githubRepo ||
    before.pullNumber !== after.pullNumber ||
    before.amountKelvin !== after.amountKelvin ||
    before.deadlineUnixMs !== after.deadlineUnixMs ||
    before.claimRequest !== after.claimRequest ||
    before.claimTarget !== after.claimTarget ||
    after.nextBranchNumber < before.nextBranchNumber ||
    after.checks < before.checks
  ) {
    return false;
  }

  if (
    before.beneficiary !== MERGEPAY_UNASSIGNED_BENEFICIARY &&
    before.beneficiary !== after.beneficiary
  ) {
    return false;
  }
  if (
    (before.claimantGithub && before.claimantGithub !== after.claimantGithub) ||
    (before.claimantGithubId !== 0n &&
      before.claimantGithubId !== after.claimantGithubId)
  ) {
    return false;
  }

  if (
    (before.funded && !after.funded) ||
    (before.mergeConfirmed && !after.mergeConfirmed) ||
    (before.paid && !after.paid) ||
    (before.refunded && !after.refunded)
  ) {
    return false;
  }

  if (beforeLifecycle === "paid") return afterLifecycle === "paid";
  if (beforeLifecycle === "refunded") return afterLifecycle === "refunded";
  return true;
}
