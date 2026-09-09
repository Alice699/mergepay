import {
  MERGEPAY_PROGRAM_ID,
  DEFAULT_RIALO_NETWORK,
  MERGEPAY_CALLBACK_DISCRIMINANT,
  MERGEPAY_INSTRUCTION_DISCRIMINANTS,
  MERGEPAY_UNASSIGNED_BENEFICIARY,
} from "./constants.js";
import { decodeWorkflowAccount } from "./accounts/index.js";
import {
  buildCheckMergeInstruction,
  buildAcceptClaimInstruction,
  buildCreateBountyInstruction,
  buildFundInstruction,
  buildPrepareFundingInstruction,
  buildRequestClaimInstruction,
  buildRefundInstruction,
  buildStatusInstruction,
  type CheckMergeInstructionInput,
  type AcceptClaimInstructionInput,
  type CreateBountyInstructionInput,
  type FundInstructionInput,
  type PrepareFundingInstructionInput,
  type MergePayInstruction,
  type RequestClaimInstructionInput,
  type WorkflowInstructionInput,
} from "./instructions/index.js";
import { deriveWorkflowPda } from "./pda/index.js";
import {
  MergePayRpcClient,
  type MergePayConfirmation,
  type MergePayTransactionResponse,
} from "./rpc/index.js";
import {
  buildUnsignedTransaction,
  serializeTransaction,
  type BuildTransactionOptions,
} from "./transactions/index.js";
import type {
  DecodedMergePayWorkflow,
  MergePayAccountInfo,
  MergePayInstructionName,
  RialoNetwork,
  WorkflowSlug,
} from "./types.js";
import { decodeBase58, decodeBase64 } from "./encoding.js";
import type { HttpTransportConfig, Transaction } from "@rialo/ts-cdk";

export interface MergePayClientOptions {
  network?: RialoNetwork;
  programId?: string;
  rpcUrl?: string;
  transport?: HttpTransportConfig;
  rpc?: MergePayRpcClient;
}

export interface MergePayActivityItem {
  signature: string;
  blockHeight: bigint;
  blockTime: bigint | null;
  status: "confirmed" | "failed";
  error: string | null;
  action: MergePayInstructionName | "network";
  workflowAddress: string | null;
  workflowSlug: string | null;
  workflowPayer: string | null;
  legacyInstruction: boolean;
  feeKelvin: bigint | null;
}

export type MergePayPublicBountyStatus =
  | "open"
  | "claimed"
  | "funded"
  | "merge_confirmed";

export interface MergePayPublicBounty {
  workflow: DecodedMergePayWorkflow;
  workflowSlug: string;
  status: MergePayPublicBountyStatus;
  createdSignature: string;
  blockHeight: bigint;
  blockTime: bigint | null;
}

export interface MergePayPublicBountyPage {
  items: MergePayPublicBounty[];
  nextBefore: string | null;
  hasMore: boolean;
  scannedTransactions: number;
}

export interface MergePayPublicBountyPageOptions {
  limit?: number;
  before?: string;
}

export class MergePayClient {
  readonly network: RialoNetwork;
  readonly programId: string;
  readonly rpc: MergePayRpcClient;

  constructor(options: MergePayClientOptions = {}) {
    this.network = options.network ?? DEFAULT_RIALO_NETWORK;
    this.programId = options.programId ?? MERGEPAY_PROGRAM_ID;
    this.rpc =
      options.rpc ??
      new MergePayRpcClient({
        network: this.network,
        ...(options.rpcUrl ? { rpcUrl: options.rpcUrl } : {}),
        ...(options.transport ? { transport: options.transport } : {}),
      });
  }

  deriveWorkflowPda(payer: string, workflowSlug: WorkflowSlug) {
    return deriveWorkflowPda(this.programId, payer, workflowSlug);
  }

  async getWorkflow(
    sponsor: string,
    workflowSlug: WorkflowSlug,
  ): Promise<DecodedMergePayWorkflow | null> {
    const pda = this.deriveWorkflowPda(sponsor, workflowSlug);
    const account = await this.rpc.getAccountInfo(pda.address);
    if (!account) return null;
    return decodeWorkflowAccount(account, this.programId);
  }

  async getWorkflowByAddress(address: string): Promise<DecodedMergePayWorkflow | null> {
    const account = await this.rpc.getAccountInfo(address);
    if (!account) return null;
    return decodeWorkflowAccount(account, this.programId);
  }

  async getAccountInfo(address: string): Promise<MergePayAccountInfo | null> {
    return this.rpc.getAccountInfo(address);
  }

  buildCreateBounty(
    input: Omit<CreateBountyInstructionInput, "programId">,
  ): MergePayInstruction {
    return buildCreateBountyInstruction({ ...input, programId: this.programId });
  }

  buildRequestClaim(
    input: Omit<RequestClaimInstructionInput, "programId">,
  ): MergePayInstruction {
    return buildRequestClaimInstruction({ ...input, programId: this.programId });
  }

  buildAcceptClaim(
    input: Omit<AcceptClaimInstructionInput, "programId">,
  ): MergePayInstruction {
    return buildAcceptClaimInstruction({ ...input, programId: this.programId });
  }

  buildFund(input: Omit<FundInstructionInput, "programId">): MergePayInstruction {
    return buildFundInstruction({ ...input, programId: this.programId });
  }

  buildPrepareFunding(
    input: Omit<PrepareFundingInstructionInput, "programId">,
  ): MergePayInstruction {
    return buildPrepareFundingInstruction({ ...input, programId: this.programId });
  }

  buildCheckMerge(
    input: Omit<CheckMergeInstructionInput, "programId">,
  ): MergePayInstruction {
    return buildCheckMergeInstruction({ ...input, programId: this.programId });
  }

  buildRefund(input: Omit<WorkflowInstructionInput, "programId">): MergePayInstruction {
    return buildRefundInstruction({ ...input, programId: this.programId });
  }

  buildStatus(input: Omit<WorkflowInstructionInput, "programId">): MergePayInstruction {
    return buildStatusInstruction({ ...input, programId: this.programId });
  }

  async buildTransaction(
    payer: string,
    instructions: readonly MergePayInstruction[],
    options: Omit<BuildTransactionOptions, "configHashPrefix"> & {
      configHashPrefix?: bigint | number;
    } = {},
  ): Promise<Transaction> {
    const configHashPrefix =
      options.configHashPrefix ?? (await this.rpc.getConfigHashPrefix());
    return buildUnsignedTransaction(payer, instructions, {
      ...options,
      configHashPrefix,
    });
  }

  async sendAndConfirm(
    transaction: Transaction | Uint8Array,
    options?: Parameters<MergePayRpcClient["sendAndConfirmTransaction"]>[1],
  ): Promise<MergePayConfirmation> {
    return this.rpc.sendAndConfirmTransaction(serializeTransaction(transaction), options);
  }

  confirm(
    signature: string,
    options?: Parameters<MergePayRpcClient["confirmTransaction"]>[1],
  ): Promise<MergePayConfirmation> {
    return this.rpc.confirmTransaction(signature, options);
  }

  getTransaction(signature: string): Promise<MergePayTransactionResponse | null> {
    return this.rpc.getTransaction(signature);
  }

  async getWalletActivity(
    address: string,
    limit = 12,
  ): Promise<MergePayActivityItem[]> {
    const signatures = await this.rpc.getSignaturesForAddress(address, limit);
    return this.decodeWalletActivity(signatures);
  }

  async getPublicBountiesPage(
    options: MergePayPublicBountyPageOptions = {},
  ): Promise<MergePayPublicBountyPage> {
    const pageSize = Math.min(Math.max(Math.trunc(options.limit ?? 25), 1), 25);
    const signatures = await this.rpc.getSignaturesForAddressPage(
      this.programId,
      pageSize,
      options.before,
    );
    const activity = await this.decodeWalletActivity(signatures);
    const candidates = activity.filter(
      (item): item is MergePayActivityItem & {
        action: "create_bounty";
        workflowAddress: string;
        workflowSlug: string;
        workflowPayer: string;
      } =>
        item.action === "create_bounty" &&
        !item.legacyInstruction &&
        item.status === "confirmed" &&
        item.workflowAddress !== null &&
        item.workflowSlug !== null &&
        item.workflowPayer !== null,
    );

    const seen = new Set<string>();
    const now = BigInt(Date.now());
    const records = await Promise.all(
      candidates.map(async (item) => {
        if (seen.has(item.workflowAddress)) return null;
        seen.add(item.workflowAddress);

        try {
          const expectedWorkflow = deriveWorkflowPda(
            this.programId,
            item.workflowPayer,
            item.workflowSlug,
          );
          if (expectedWorkflow.address !== item.workflowAddress) return null;

          const workflow = await this.getWorkflowByAddress(item.workflowAddress);
          if (!workflow || workflow.state.sponsor !== item.workflowPayer) return null;

          const status = publicBountyStatus(workflow.state, now);
          if (!status) return null;

          return {
            workflow,
            workflowSlug: item.workflowSlug,
            status,
            createdSignature: item.signature,
            blockHeight: item.blockHeight,
            blockTime: item.blockTime,
          } satisfies MergePayPublicBounty;
        } catch {
          return null;
        }
      }),
    );

    const nextBefore =
      signatures.length === pageSize
        ? signatures[signatures.length - 1]?.signature ?? null
        : null;

    return {
      items: records
        .filter((record): record is MergePayPublicBounty => record !== null)
        .sort((left, right) => (left.blockHeight < right.blockHeight ? 1 : -1)),
      nextBefore,
      hasMore: nextBefore !== null,
      scannedTransactions: signatures.length,
    };
  }

  async getOpenBounties(limit = 100): Promise<MergePayPublicBounty[]> {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const openBounties: MergePayPublicBounty[] = [];
    const seen = new Set<string>();
    let before: string | undefined;

    while (openBounties.length < boundedLimit) {
      const page = await this.getPublicBountiesPage({
        limit: 25,
        ...(before ? { before } : {}),
      });
      for (const bounty of page.items) {
        if (bounty.status !== "open" || seen.has(bounty.workflow.address)) continue;
        seen.add(bounty.workflow.address);
        openBounties.push(bounty);
      }
      if (!page.hasMore || !page.nextBefore) break;
      before = page.nextBefore;
    }

    return openBounties.slice(0, boundedLimit);
  }

  private async decodeWalletActivity(
    signatures: Awaited<ReturnType<MergePayRpcClient["getSignaturesForAddress"]>>,
  ): Promise<MergePayActivityItem[]> {
    const records = await Promise.all(
      signatures.map(async (signatureInfo) => ({
        signatureInfo,
        transaction: await this.getTransactionSafely(signatureInfo.signature),
      })),
    );

    return records.map(({ signatureInfo, transaction }) => {
      const mergePayInstruction = transaction
        ? findMergePayInstruction(transaction, this.programId)
        : null;
      const error = signatureInfo.err ?? transaction?.meta.err ?? null;

      return {
        signature: signatureInfo.signature,
        blockHeight: signatureInfo.blockHeight,
        blockTime: signatureInfo.blockTime ?? transaction?.blockTime ?? null,
        status: error ? "failed" : "confirmed",
        error,
        action: mergePayInstruction?.action ?? "network",
        workflowAddress: mergePayInstruction?.workflowAddress ?? null,
        workflowSlug: mergePayInstruction?.workflowSlug ?? null,
        workflowPayer: mergePayInstruction?.workflowPayer ?? null,
        legacyInstruction: mergePayInstruction?.legacyInstruction ?? false,
        feeKelvin: transaction?.meta.fee ?? null,
      };
    });
  }

  getWorkflowLineage(signature: string) {
    return this.rpc.getWorkflowLineage({
      signature,
      maxDepth: 5,
      includeEvents: true,
    });
  }

  private async getTransactionSafely(
    signature: string,
  ): Promise<MergePayTransactionResponse | null> {
    try {
      return await this.getTransaction(signature);
    } catch {
      return null;
    }
  }
}

function findMergePayInstruction(
  transaction: MergePayTransactionResponse,
  programId: string,
): {
  action: MergePayInstructionName;
  workflowAddress: string | null;
  workflowSlug: string | null;
  workflowPayer: string | null;
  legacyInstruction: boolean;
} | null {
  for (const instruction of transaction.transaction.message.instructions) {
    const invokedProgram =
      transaction.transaction.message.accountKeys[instruction.programIdIndex];
    if (invokedProgram !== programId) continue;

    const decodedInstruction = decodeInstructionName(instruction.data);
    if (!decodedInstruction) continue;
    const payerIndex = instruction.accounts[0];
    const workflowPayer =
      payerIndex === undefined
        ? null
        : transaction.transaction.message.accountKeys[payerIndex] ?? null;

    const workflowAccountIndex = instruction.accounts[1];
    return {
      action: decodedInstruction.action,
      workflowAddress:
        workflowAccountIndex === undefined
          ? null
          : transaction.transaction.message.accountKeys[workflowAccountIndex] ?? null,
      workflowSlug: decodeWorkflowSlug(instruction.data),
      workflowPayer,
      legacyInstruction: decodedInstruction.legacy,
    };
  }

  return null;
}

function decodeWorkflowSlug(data: string): string | null {
  try {
    const bytes = decodeInstructionData(data);
    if (bytes.byteLength < 36) return null;
    return Array.from(bytes.slice(4, 36), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  } catch {
    return null;
  }
}

function decodeInstructionName(
  data: string,
): { action: MergePayInstructionName; legacy: boolean } | null {
  try {
    const bytes = decodeInstructionData(data);
    if (bytes.byteLength < 4) return null;
    const discriminant = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).getUint32(0, true);
    // The retry-safe ABI invokes the generated run_merge_check timer handler
    // directly so it can carry the current Venus branch number. It is still a
    // user-facing merge-check action, not an internal callback report.
    if (
      discriminant === MERGEPAY_CALLBACK_DISCRIMINANT &&
      bytes.byteLength === 44
    ) {
      return { action: "check_merge", legacy: false };
    }
    const entry = Object.entries(MERGEPAY_INSTRUCTION_DISCRIMINANTS).find(
      ([, value]) => value === discriminant,
    );
    return entry
      ? { action: entry[0] as MergePayInstructionName, legacy: false }
      : null;
  } catch {
    return null;
  }
}

function publicBountyStatus(
  state: DecodedMergePayWorkflow["state"],
  now: bigint,
): MergePayPublicBountyStatus | null {
  if (
    !state.initialized ||
    !/^[A-Za-z0-9._-]{1,100}$/.test(state.githubOwner) ||
    !/^[A-Za-z0-9._-]{1,100}$/.test(state.githubRepo) ||
    state.pullNumber <= 0n ||
    state.amountKelvin <= 0n ||
    state.deadlineUnixMs <= now ||
    state.paid ||
    state.refunded
  ) {
    return null;
  }
  if (state.mergeConfirmed) return "merge_confirmed";
  if (state.funded) return "funded";
  if (state.beneficiary !== MERGEPAY_UNASSIGNED_BENEFICIARY) return "claimed";
  return "open";
}

function decodeInstructionData(data: string): Uint8Array {
  try {
    return decodeBase58(data, "transaction instruction");
  } catch {
    return decodeBase64(data, "transaction instruction");
  }
}

export function createMergePayClient(
  options: MergePayClientOptions = {},
): MergePayClient {
  return new MergePayClient(options);
}
