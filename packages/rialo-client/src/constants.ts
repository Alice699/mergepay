export const MERGEPAY_INSTRUCTION_NAMES = [
  "create_bounty",
  "prepare_funding",
  "fund",
  "check_merge",
  "refund",
  "status",
  "request_claim",
  "accept_claim",
] as const;

export const DEFAULT_RIALO_NETWORK = "devnet" as const;

export {
  MERGEPAY_ACCOUNT_INDEXES,
  MERGEPAY_CALLBACK_DISCRIMINANT,
  MERGEPAY_INSTRUCTION_DISCRIMINANTS,
  MERGEPAY_MANIFEST_VERSION,
  MERGEPAY_PROGRAM_ID,
  MERGEPAY_SEEDS,
  MERGEPAY_TIMER_CALLBACK_DISCRIMINANT,
  MERGEPAY_WELL_KNOWN_ADDRESSES,
  MERGEPAY_WORKFLOW_STATE_MIN_SIZE,
} from "./generated/mergepay.js";

/** Zero pubkey sentinel used for a bounty that is waiting for a claim. */
export const MERGEPAY_UNASSIGNED_BENEFICIARY =
  "11111111111111111111111111111111" as const;
