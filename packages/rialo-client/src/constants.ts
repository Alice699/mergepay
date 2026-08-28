export const MERGEPAY_INSTRUCTION_NAMES = [
  "create_bounty",
  "fund",
  "check_merge",
  "refund",
  "status",
] as const;

export const DEFAULT_RIALO_NETWORK = "devnet" as const;

export {
  MERGEPAY_ACCOUNT_INDEXES,
  MERGEPAY_CALLBACK_DISCRIMINANT,
  MERGEPAY_INSTRUCTION_DISCRIMINANTS,
  MERGEPAY_MANIFEST_VERSION,
  MERGEPAY_PROGRAM_ID,
  MERGEPAY_SEEDS,
  MERGEPAY_WELL_KNOWN_ADDRESSES,
  MERGEPAY_WORKFLOW_STATE_MIN_SIZE,
} from "./generated/mergepay.js";
