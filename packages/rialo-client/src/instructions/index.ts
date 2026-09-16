import type { AccountMeta, Instruction } from "@rialo/ts-cdk";
import { BincodeWriter, PublicKey } from "@rialo/ts-cdk";
import {
  MERGEPAY_ACCOUNT_INDEXES,
  MERGEPAY_INSTRUCTION_DISCRIMINANTS,
  MERGEPAY_SEEDS,
  MERGEPAY_UNASSIGNED_BENEFICIARY,
  MERGEPAY_WELL_KNOWN_ADDRESSES,
} from "../constants.js";
import { asU64, toPublicKey, workflowSlugToBytes } from "../encoding.js";
import {
  deriveCheckMergeControlAccounts,
  deriveMultiAccountSlug,
  deriveSubscriptionPda,
  deriveWorkflowPda,
} from "../pda/index.js";
import type { MergePayInstructionName, WorkflowSlug } from "../types.js";

export interface WorkflowInstructionInput {
  programId: string;
  payer: string;
  workflowSlug: WorkflowSlug;
}

export interface PrepareFundingInstructionInput extends WorkflowInstructionInput {
  /** Versioned preparation envelope used to resize workflow storage before funding. */
  githubAuthCiphertext: Uint8Array;
}

export type FundInstructionInput = WorkflowInstructionInput;

export interface CreateBountyInstructionInput extends WorkflowInstructionInput {
  /** Omit or use the zero pubkey to publish an unclaimed bounty. */
  beneficiary?: string;
  githubOwner: string;
  githubRepo: string;
  pullNumber: bigint | number;
  amountKelvin: bigint | number;
  deadlineUnixMs: bigint | number;
  /** Exact 40-character Git commit SHA locked into the settlement policy. */
  expectedHeadSha: string;
  /** Exact pull-request target branch locked into the settlement policy. */
  expectedBaseRef: string;
  /** Require GitHub status/check-run signals on the locked commit to pass. */
  requireCiSuccess: boolean;
  /** Required current-commit approvals from repository writers (0-10). */
  minimumApprovals: bigint | number;
  /** Account containing the immutable custom settlement REX component. */
  rexBytecodeAccount: string;
}

export interface RequestClaimInstructionInput extends WorkflowInstructionInput {
  targetWorkflow: string;
  claimantGithub: string;
  claimantGithubId: bigint | number;
  /** Must reproduce the target bounty's immutable REX component account. */
  rexBytecodeAccount: string;
}

export interface AcceptClaimInstructionInput extends WorkflowInstructionInput {
  claimWorkflow: string;
}

export interface CheckMergeInstructionInput extends WorkflowInstructionInput {
  /**
   * @deprecated The public control instruction always starts a fresh timer
   * branch. Kept as an ignored compatibility field for older callers.
   */
  branchNumber?: number;
}

/** SDK instruction plus protocol-level metadata useful to the UI and tests. */
export interface MergePayInstruction extends Instruction {
  readonly name: MergePayInstructionName;
  readonly workflowPda: string;
}

function isPackedGithubRexEnvelope(bytes: Uint8Array): boolean {
  if (bytes.length < 10 || bytes[0] !== 2) {
    return false;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const urlLength = view.getUint32(1, true);
  const authLengthOffset = 5 + urlLength;
  if (urlLength < 2 || authLengthOffset + 4 > bytes.length) {
    return false;
  }

  const authLength = view.getUint32(authLengthOffset, true);
  const authStart = authLengthOffset + 4;
  return (
    authLength >= 2 &&
    authStart + authLength === bytes.length &&
    bytes[5] === 2 &&
    bytes[authStart] === 2
  );
}

function meta(
  pubkey: PublicKey,
  isSigner: boolean,
  isWritable: boolean,
): AccountMeta {
  return { pubkey, isSigner, isWritable };
}

function simpleAccounts(payer: PublicKey, workflowPda: PublicKey): AccountMeta[] {
  // This is the generated external ABI: every initiating call includes the
  // subscriber interface, even when the call itself does not schedule REX.
  return [
    meta(payer, true, true),
    meta(workflowPda, false, true),
    meta(
      PublicKey.fromString(MERGEPAY_WELL_KNOWN_ADDRESSES.systemProgram),
      false,
      false,
    ),
    meta(
      PublicKey.fromString(MERGEPAY_WELL_KNOWN_ADDRESSES.subscriberInterface),
      false,
      false,
    ),
  ];
}

function userAccountAccounts(
  payer: PublicKey,
  workflowPda: PublicKey,
  userAccount: PublicKey,
): AccountMeta[] {
  // request_claim and accept_claim do not schedule Venus work. The generated
  // runtime therefore reads the user-provided account immediately after the
  // system program. The manifest generator currently lists Subscriber111...
  // unconditionally for these functions, but inserting it here shifts the
  // target/claim account and makes the runtime return IncorrectProgramId.
  return [
    meta(payer, true, true),
    meta(workflowPda, false, true),
    meta(
      PublicKey.fromString(MERGEPAY_WELL_KNOWN_ADDRESSES.systemProgram),
      false,
      false,
    ),
    meta(userAccount, false, false),
  ];
}

function fundAccounts(payer: PublicKey, workflowPda: PublicKey): AccountMeta[] {
  const subscriptionSlug = deriveMultiAccountSlug(
    workflowPda.toString(),
    0,
    MERGEPAY_ACCOUNT_INDEXES.fundSubscriptionPda,
  );
  const subscription = deriveSubscriptionPda(payer.toString(), subscriptionSlug);

  return [
    ...simpleAccounts(payer, workflowPda),
    meta(PublicKey.fromString(subscription.address), false, true),
  ];
}

function instruction(
  name: MergePayInstructionName,
  input: WorkflowInstructionInput,
  data: Uint8Array,
  accounts: AccountMeta[],
  workflowPda: string,
): MergePayInstruction {
  return {
    name,
    workflowPda,
    programId: toPublicKey(input.programId, "program ID"),
    accounts,
    data,
  };
}

function controlInstruction(
  name: Exclude<
    MergePayInstructionName,
    "create_bounty" | "check_merge" | "request_claim"
  >,
  input: WorkflowInstructionInput,
): MergePayInstruction {
  const payer = toPublicKey(input.payer, "payer");
  const workflow = deriveWorkflowPda(input.programId, input.payer, input.workflowSlug);
  const writer = new BincodeWriter();
  writer
    .writeU32(MERGEPAY_INSTRUCTION_DISCRIMINANTS[name])
    .writeFixedArray(workflowSlugToBytes(input.workflowSlug), 32);

  return instruction(
    name,
    input,
    writer.toBytes(),
    name === "fund"
      ? fundAccounts(payer, PublicKey.fromString(workflow.address))
      : simpleAccounts(payer, PublicKey.fromString(workflow.address)),
    workflow.address,
  );
}

export function buildStatusInstruction(
  input: WorkflowInstructionInput,
): MergePayInstruction {
  return controlInstruction("status", input);
}

export function buildFundInstruction(
  input: FundInstructionInput,
): MergePayInstruction {
  return controlInstruction("fund", input);
}

export function buildPrepareFundingInstruction(
  input: PrepareFundingInstructionInput,
): MergePayInstruction {
  const payer = toPublicKey(input.payer, "payer");
  const workflow = deriveWorkflowPda(input.programId, input.payer, input.workflowSlug);
  if (!(input.githubAuthCiphertext instanceof Uint8Array)) {
    throw new TypeError("githubAuthCiphertext must be a Uint8Array");
  }
  if (
    input.githubAuthCiphertext.length < 2 ||
    input.githubAuthCiphertext.length > 4_096 ||
    !isPackedGithubRexEnvelope(input.githubAuthCiphertext)
  ) {
    throw new RangeError(
      "githubAuthCiphertext must be a packed settlement preparation envelope",
    );
  }

  const writer = new BincodeWriter();
  writer
    .writeU32(MERGEPAY_INSTRUCTION_DISCRIMINANTS.prepare_funding)
    .writeFixedArray(workflowSlugToBytes(input.workflowSlug), 32)
    .writeVecBytes(input.githubAuthCiphertext);

  return instruction(
    "prepare_funding",
    input,
    writer.toBytes(),
    simpleAccounts(payer, PublicKey.fromString(workflow.address)),
    workflow.address,
  );
}

export function buildRefundInstruction(
  input: WorkflowInstructionInput,
): MergePayInstruction {
  return controlInstruction("refund", input);
}

export function buildAcceptClaimInstruction(
  input: AcceptClaimInstructionInput,
): MergePayInstruction {
  const payer = toPublicKey(input.payer, "payer");
  const claimWorkflow = toPublicKey(input.claimWorkflow, "claim workflow");
  const workflow = deriveWorkflowPda(input.programId, input.payer, input.workflowSlug);
  const writer = new BincodeWriter();
  writer
    .writeU32(MERGEPAY_INSTRUCTION_DISCRIMINANTS.accept_claim)
    .writeFixedArray(workflowSlugToBytes(input.workflowSlug), 32)
    .writeFixedArray(claimWorkflow.toBytes(), 32);

  return instruction(
    "accept_claim",
    input,
    writer.toBytes(),
    userAccountAccounts(
      payer,
      PublicKey.fromString(workflow.address),
      claimWorkflow,
    ),
    workflow.address,
  );
}

export function buildRequestClaimInstruction(
  input: RequestClaimInstructionInput,
): MergePayInstruction {
  const payer = toPublicKey(input.payer, "payer");
  const targetWorkflow = toPublicKey(input.targetWorkflow, "target workflow");
  const claimantGithub = input.claimantGithub.trim();
  validateGithubSlug(claimantGithub, "GitHub username");
  const claimantGithubId = asU64(input.claimantGithubId, "GitHub user ID");
  if (claimantGithubId === 0n) throw new RangeError("GitHub user ID must be greater than zero");
  const rexBytecodeAccount = toPublicKey(
    input.rexBytecodeAccount,
    "REX bytecode account",
  );
  if (rexBytecodeAccount.equals(PublicKey.fromString(MERGEPAY_UNASSIGNED_BENEFICIARY))) {
    throw new RangeError("REX bytecode account must be configured");
  }
  const workflow = deriveWorkflowPda(input.programId, input.payer, input.workflowSlug);
  const writer = new BincodeWriter();
  writer
    .writeU32(MERGEPAY_INSTRUCTION_DISCRIMINANTS.request_claim)
    .writeFixedArray(workflowSlugToBytes(input.workflowSlug), 32)
    .writeFixedArray(targetWorkflow.toBytes(), 32)
    .writeString(claimantGithub)
    .writeU64(claimantGithubId)
    .writeFixedArray(rexBytecodeAccount.toBytes(), 32);

  return instruction(
    "request_claim",
    input,
    writer.toBytes(),
    userAccountAccounts(
      payer,
      PublicKey.fromString(workflow.address),
      targetWorkflow,
    ),
    workflow.address,
  );
}

export function buildCreateBountyInstruction(
  input: CreateBountyInstructionInput,
): MergePayInstruction {
  const beneficiary = toPublicKey(
    input.beneficiary ?? MERGEPAY_UNASSIGNED_BENEFICIARY,
    "beneficiary",
  );
  validateGithubSlug(input.githubOwner, "github owner");
  validateGithubSlug(input.githubRepo, "github repository");
  const pullNumber = asU64(input.pullNumber, "pull number");
  const amountKelvin = asU64(input.amountKelvin, "amount_kelvin");
  const deadlineUnixMs = asU64(input.deadlineUnixMs, "deadline_unix_ms");
  const expectedHeadSha = input.expectedHeadSha.trim().toLowerCase();
  const expectedBaseRef = input.expectedBaseRef.trim();
  const minimumApprovals = asU64(input.minimumApprovals, "minimum approvals");
  const rexBytecodeAccount = toPublicKey(
    input.rexBytecodeAccount,
    "REX bytecode account",
  );
  if (pullNumber === 0n) throw new RangeError("pull number must be greater than zero");
  if (amountKelvin === 0n) throw new RangeError("amount_kelvin must be greater than zero");
  if (deadlineUnixMs === 0n) throw new RangeError("deadline_unix_ms must be greater than zero");
  if (!/^[a-f0-9]{40}$/.test(expectedHeadSha)) {
    throw new TypeError("expected head SHA must be exactly 40 hexadecimal characters");
  }
  validateGithubRef(expectedBaseRef);
  if (minimumApprovals > 10n) {
    throw new RangeError("minimum approvals must be between 0 and 10");
  }
  if (rexBytecodeAccount.equals(PublicKey.fromString(MERGEPAY_UNASSIGNED_BENEFICIARY))) {
    throw new RangeError("REX bytecode account must be configured");
  }

  const payer = toPublicKey(input.payer, "payer");
  const workflow = deriveWorkflowPda(input.programId, input.payer, input.workflowSlug);
  const writer = new BincodeWriter();
  writer
    .writeU32(MERGEPAY_INSTRUCTION_DISCRIMINANTS.create_bounty)
    .writeFixedArray(workflowSlugToBytes(input.workflowSlug), 32)
    .writeFixedArray(beneficiary.toBytes(), 32)
    .writeString(input.githubOwner)
    .writeString(input.githubRepo)
    .writeU64(pullNumber)
    .writeU64(amountKelvin)
    .writeU64(deadlineUnixMs)
    .writeString(expectedHeadSha)
    .writeString(expectedBaseRef)
    .writeBool(input.requireCiSuccess)
    .writeU64(minimumApprovals)
    .writeFixedArray(rexBytecodeAccount.toBytes(), 32);

  return instruction(
    "create_bounty",
    input,
    writer.toBytes(),
    simpleAccounts(payer, PublicKey.fromString(workflow.address)),
    workflow.address,
  );
}

export function buildCheckMergeInstruction(
  input: CheckMergeInstructionInput,
): MergePayInstruction {
  const payer = toPublicKey(input.payer, "payer");
  const derived = deriveCheckMergeControlAccounts(
    input.programId,
    input.payer,
    input.workflowSlug,
  );
  const writer = new BincodeWriter();
  writer
    // Use the public control ABI. It resets next_merge_check_unix_ms before
    // arming a fresh native timer, so a manual check cannot be swallowed by
    // the previous heartbeat throttle.
    .writeU32(MERGEPAY_INSTRUCTION_DISCRIMINANTS.check_merge)
    .writeFixedArray(workflowSlugToBytes(input.workflowSlug), 32);

  return instruction(
    "check_merge",
    input,
    writer.toBytes(),
    [
      meta(payer, true, true),
      meta(PublicKey.fromString(derived.workflow.address), false, true),
      meta(
        PublicKey.fromString(MERGEPAY_WELL_KNOWN_ADDRESSES.systemProgram),
        false,
        false,
      ),
      meta(
        PublicKey.fromString(MERGEPAY_WELL_KNOWN_ADDRESSES.subscriberInterface),
        false,
        false,
      ),
      meta(PublicKey.fromString(derived.subscription.address), false, true),
    ],
    derived.workflow.address,
  );
}

function validateGithubSlug(value: string, label: string): void {
  if (
    value.length === 0 ||
    value.length > 100 ||
    !/^[A-Za-z0-9._-]+$/.test(value)
  ) {
    throw new TypeError(
      `${label} must be 1-100 ASCII characters containing only letters, numbers, '.', '_' or '-'`,
    );
  }
}

function validateGithubRef(value: string): void {
  if (
    value.length === 0 ||
    value.length > 128 ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("..") ||
    !/^[A-Za-z0-9._/-]+$/.test(value)
  ) {
    throw new TypeError(
      "expected base ref must be a valid 1-128 character Git branch name",
    );
  }
}
