import type { AccountMeta, Instruction } from "@rialo/ts-cdk";
import { BincodeWriter, PublicKey } from "@rialo/ts-cdk";
import {
  MERGEPAY_INSTRUCTION_DISCRIMINANTS,
  MERGEPAY_SEEDS,
  MERGEPAY_WELL_KNOWN_ADDRESSES,
} from "../constants.js";
import { asU64, toPublicKey, workflowSlugToBytes } from "../encoding.js";
import { deriveCheckMergeAccounts, deriveWorkflowPda } from "../pda/index.js";
import type { MergePayInstructionName, WorkflowSlug } from "../types.js";

export interface WorkflowInstructionInput {
  programId: string;
  payer: string;
  workflowSlug: WorkflowSlug;
}

export interface CreateBountyInstructionInput extends WorkflowInstructionInput {
  beneficiary: string;
  githubOwner: string;
  githubRepo: string;
  pullNumber: bigint | number;
  amountKelvin: bigint | number;
  deadlineUnixMs: bigint | number;
}

export interface CheckMergeInstructionInput extends WorkflowInstructionInput {
  /** Venus allocates the first async branch as branch zero. */
  branchNumber?: number;
}

/** SDK instruction plus protocol-level metadata useful to the UI and tests. */
export interface MergePayInstruction extends Instruction {
  readonly name: MergePayInstructionName;
  readonly workflowPda: string;
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
  name: Exclude<MergePayInstructionName, "create_bounty" | "check_merge">,
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
    simpleAccounts(payer, PublicKey.fromString(workflow.address)),
    workflow.address,
  );
}

export function buildStatusInstruction(
  input: WorkflowInstructionInput,
): MergePayInstruction {
  return controlInstruction("status", input);
}

export function buildFundInstruction(
  input: WorkflowInstructionInput,
): MergePayInstruction {
  return controlInstruction("fund", input);
}

export function buildRefundInstruction(
  input: WorkflowInstructionInput,
): MergePayInstruction {
  return controlInstruction("refund", input);
}

export function buildCreateBountyInstruction(
  input: CreateBountyInstructionInput,
): MergePayInstruction {
  const beneficiary = toPublicKey(input.beneficiary, "beneficiary");
  if (beneficiary.equals(PublicKey.fromBytes(new Uint8Array(32)))) {
    throw new TypeError("beneficiary must not be the default public key");
  }
  validateGithubSlug(input.githubOwner, "github owner");
  validateGithubSlug(input.githubRepo, "github repository");
  const pullNumber = asU64(input.pullNumber, "pull number");
  const amountKelvin = asU64(input.amountKelvin, "amount_kelvin");
  const deadlineUnixMs = asU64(input.deadlineUnixMs, "deadline_unix_ms");
  if (pullNumber === 0n) throw new RangeError("pull number must be greater than zero");
  if (amountKelvin === 0n) throw new RangeError("amount_kelvin must be greater than zero");
  if (deadlineUnixMs === 0n) throw new RangeError("deadline_unix_ms must be greater than zero");

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
    .writeU64(deadlineUnixMs);

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
  const derived = deriveCheckMergeAccounts(
    input.programId,
    input.payer,
    input.workflowSlug,
    input.branchNumber ?? 0,
  );
  const writer = new BincodeWriter();
  writer
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
        PublicKey.fromString(MERGEPAY_WELL_KNOWN_ADDRESSES.rexRegistry),
        false,
        false,
      ),
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
      meta(PublicKey.fromString(derived.rex.address), false, true),
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
