import {
  MERGEPAY_PROGRAM_ID,
  DEFAULT_RIALO_NETWORK,
  MERGEPAY_INSTRUCTION_DISCRIMINANTS,
} from "./constants.js";
import { decodeWorkflowAccount } from "./accounts/index.js";
import {
  buildCheckMergeInstruction,
  buildCreateBountyInstruction,
  buildFundInstruction,
  buildRefundInstruction,
  buildStatusInstruction,
  type CheckMergeInstructionInput,
  type CreateBountyInstructionInput,
  type MergePayInstruction,
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
import { decodeBase64 } from "./encoding.js";
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
  feeKelvin: bigint | null;
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

  async getAccountInfo(address: string): Promise<MergePayAccountInfo | null> {
    return this.rpc.getAccountInfo(address);
  }

  buildCreateBounty(
    input: Omit<CreateBountyInstructionInput, "programId">,
  ): MergePayInstruction {
    return buildCreateBountyInstruction({ ...input, programId: this.programId });
  }

  buildFund(input: Omit<WorkflowInstructionInput, "programId">): MergePayInstruction {
    return buildFundInstruction({ ...input, programId: this.programId });
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
): { action: MergePayInstructionName; workflowAddress: string | null } | null {
  for (const instruction of transaction.transaction.message.instructions) {
    const invokedProgram =
      transaction.transaction.message.accountKeys[instruction.programIdIndex];
    if (invokedProgram !== programId) continue;

    const action = decodeInstructionName(instruction.data);
    if (!action) continue;

    const workflowAccountIndex = instruction.accounts[1];
    return {
      action,
      workflowAddress:
        workflowAccountIndex === undefined
          ? null
          : transaction.transaction.message.accountKeys[workflowAccountIndex] ?? null,
    };
  }

  return null;
}

function decodeInstructionName(data: string): MergePayInstructionName | null {
  try {
    const bytes = decodeBase64(data, "transaction instruction");
    if (bytes.byteLength < 4) return null;
    const discriminant = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).getUint32(0, true);
    const entry = Object.entries(MERGEPAY_INSTRUCTION_DISCRIMINANTS).find(
      ([, value]) => value === discriminant,
    );
    return (entry?.[0] as MergePayInstructionName | undefined) ?? null;
  } catch {
    return null;
  }
}

export function createMergePayClient(
  options: MergePayClientOptions = {},
): MergePayClient {
  return new MergePayClient(options);
}
