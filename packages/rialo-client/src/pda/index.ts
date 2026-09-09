import { sha256 } from "@noble/hashes/sha2.js";
import { PublicKey } from "@rialo/ts-cdk";
import {
  MERGEPAY_ACCOUNT_INDEXES,
  MERGEPAY_SEEDS,
  MERGEPAY_WELL_KNOWN_ADDRESSES,
} from "../constants.js";
import { toPublicKey, workflowSlugToBytes } from "../encoding.js";
import type { WorkflowSlug } from "../types.js";

export interface DerivedPda {
  address: string;
  bump: number;
}

export interface DerivedWorkflowAccounts {
  workflow: DerivedPda;
  subscription: DerivedPda;
  retrySubscription: DerivedPda;
  rex: DerivedPda;
  subscriptionSlug: Uint8Array;
  retrySubscriptionSlug: Uint8Array;
  rexSlug: Uint8Array;
}

function u64Le(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("PDA index values must be non-negative safe integers");
  }
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
  return bytes;
}

function derivePda(seeds: (string | Uint8Array)[], programId: string): DerivedPda {
  const [address, bump] = PublicKey.findProgramAddress(
    seeds,
    toPublicKey(programId, "program ID"),
  );
  return { address: address.toString(), bump };
}

export function deriveWorkflowPda(
  programId: string,
  payer: string,
  workflowSlug: WorkflowSlug,
): DerivedPda {
  return derivePda(
    [
      MERGEPAY_SEEDS.workflow,
      toPublicKey(payer, "payer").toBytes(),
      workflowSlugToBytes(workflowSlug),
    ],
    programId,
  );
}

/**
 * Matches Venus' generated multi_account_slug helper exactly:
 * SHA-256(workflow PDA bytes || branch u64 LE || account index u64 LE).
 */
export function deriveMultiAccountSlug(
  workflowPda: string,
  branchNumber: number,
  accountIndex: number,
): Uint8Array {
  const payload = new Uint8Array(32 + 8 + 8);
  toPublicKey(workflowPda, "workflow PDA").toBytes().forEach((byte, index) => {
    payload[index] = byte;
  });
  payload.set(u64Le(branchNumber), 32);
  payload.set(u64Le(accountIndex), 40);
  return sha256(payload);
}

export function deriveSubscriptionPda(
  payer: string,
  subscriptionSlug: Uint8Array,
): DerivedPda {
  if (subscriptionSlug.length !== 32) {
    throw new RangeError("subscription slug must contain exactly 32 bytes");
  }
  return derivePda(
    [
      MERGEPAY_SEEDS.subscription,
      toPublicKey(payer, "payer").toBytes(),
      subscriptionSlug,
    ],
    MERGEPAY_WELL_KNOWN_ADDRESSES.subscriberInterface,
  );
}

export function deriveRexPda(payer: string, rexSlug: Uint8Array): DerivedPda {
  if (rexSlug.length !== 32) {
    throw new RangeError("REX slug must contain exactly 32 bytes");
  }
  return derivePda(
    [
      MERGEPAY_SEEDS.rex,
      toPublicKey(payer, "payer").toBytes(),
      rexSlug,
    ],
    MERGEPAY_WELL_KNOWN_ADDRESSES.rexRegistry,
  );
}

export function deriveEventDataPda(
  payer: string,
  workflowPda: string,
  branchNumber: number,
  rexAccountIndex: number,
): DerivedPda {
  const eventSlug = deriveMultiAccountSlug(
    workflowPda,
    branchNumber,
    rexAccountIndex,
  );
  return derivePda(
    [
      MERGEPAY_SEEDS.eventData,
      toPublicKey(payer, "payer").toBytes(),
      eventSlug,
    ],
    MERGEPAY_WELL_KNOWN_ADDRESSES.rexProcessor,
  );
}

/**
 * Derive the three auxiliary accounts inserted by the generated
 * `run_merge_check` callback ABI. The callback schedules its next native timer
 * and starts one REX request, so it needs two subscription PDAs and one REX
 * PDA. Each one-shot branch uses the current Venus branch because the prior
 * accounts are consumed after the callback completes.
 */
export function deriveCheckMergeAccounts(
  programId: string,
  payer: string,
  workflowSlug: WorkflowSlug,
  branchNumber = 0,
): DerivedWorkflowAccounts {
  const workflow = deriveWorkflowPda(programId, payer, workflowSlug);
  const subscriptionSlug = deriveMultiAccountSlug(
    workflow.address,
    branchNumber,
    MERGEPAY_ACCOUNT_INDEXES.subscriptionPda,
  );
  const subscription = deriveSubscriptionPda(payer, subscriptionSlug);
  const retrySubscriptionSlug = deriveMultiAccountSlug(
    workflow.address,
    branchNumber,
    MERGEPAY_ACCOUNT_INDEXES.retrySubscriptionPda,
  );
  const retrySubscription = deriveSubscriptionPda(payer, retrySubscriptionSlug);
  const rexSlug = deriveMultiAccountSlug(
    workflow.address,
    branchNumber,
    MERGEPAY_ACCOUNT_INDEXES.rexPda,
  );
  const rex = deriveRexPda(payer, rexSlug);

  return {
    workflow,
    subscription,
    retrySubscription,
    rex,
    subscriptionSlug,
    retrySubscriptionSlug,
    rexSlug,
  };
}
