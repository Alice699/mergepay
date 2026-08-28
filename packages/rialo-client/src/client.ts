import {
  MERGEPAY_PROGRAM_ID,
  DEFAULT_RIALO_NETWORK,
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
  RialoNetwork,
  WorkflowSlug,
} from "./types.js";
import type { HttpTransportConfig, Transaction } from "@rialo/ts-cdk";

export interface MergePayClientOptions {
  network?: RialoNetwork;
  programId?: string;
  rpcUrl?: string;
  transport?: HttpTransportConfig;
  rpc?: MergePayRpcClient;
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
}

export function createMergePayClient(
  options: MergePayClientOptions = {},
): MergePayClient {
  return new MergePayClient(options);
}
