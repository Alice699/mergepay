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
import {
  PublicKey,
  type HttpTransportConfig,
  type Transaction,
} from "@rialo/ts-cdk";

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
  relatedWorkflowAddress: string | null;
  workflowSlug: string | null;
  workflowPayer: string | null;
  legacyInstruction: boolean;
  feeKelvin: bigint | null;
}

export interface MergePayActivityPage {
  items: MergePayActivityItem[];
  nextBefore: string | null;
  hasMore: boolean;
}

export interface MergePayActivityPageOptions {
  limit?: number;
  before?: string;
}

export interface MergePayClaimRequest {
  signature: string;
  blockHeight: bigint;
  blockTime: bigint | null;
  claim: DecodedMergePayWorkflow;
}

export type MergePaySettlementOutcome = "paid" | "refunded";
export type MergePaySettlementRole = "beneficiary" | "sponsor";

export interface MergePaySettlementItem {
  signature: string;
  blockHeight: bigint;
  blockTime: bigint | null;
  outcome: MergePaySettlementOutcome;
  role: MergePaySettlementRole;
  action: MergePayInstructionName;
  workflowAddress: string;
  workflowSlug: string | null;
  workflow: DecodedMergePayWorkflow;
}

export interface MergePaySettlementPage {
  items: MergePaySettlementItem[];
  nextBefore: string | null;
  hasMore: boolean;
  scannedTransactions: number;
}

export interface MergePaySettlementPageOptions {
  limit?: number;
  before?: string;
}

interface TimedPromise<T> {
  expiresAt: number;
  promise: Promise<T>;
}

const SETTLEMENT_SOURCE_PAGE_SIZE = 12;
const SETTLEMENT_MAX_SCAN_PAGES = 1;
const CLAIM_DISCOVERY_PAGE_SIZE = 12;
const REQUEST_CLAIM_TARGET_OFFSET = 4 + 32;
const TRANSACTION_CACHE_TTL_MS = 30_000;
const WORKFLOW_CACHE_TTL_MS = 5_000;
const MAX_READ_CACHE_ENTRIES = 256;

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
  private readonly transactionCache = new Map<
    string,
    TimedPromise<MergePayTransactionResponse | null>
  >();
  private readonly workflowCache = new Map<
    string,
    TimedPromise<DecodedMergePayWorkflow | null>
  >();

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

  async getWalletActivityPage(
    address: string,
    options: MergePayActivityPageOptions = {},
  ): Promise<MergePayActivityPage> {
    // Keep one RPC slot for look-ahead so the UI only enables Next when an
    // additional page is known to exist. Rialo caps this request at 25 records.
    const pageSize = Math.min(Math.max(Math.trunc(options.limit ?? 8), 1), 24);
    const signatures = await this.rpc.getSignaturesForAddressPage(
      address,
      pageSize + 1,
      options.before,
    );
    const hasMore = signatures.length > pageSize;
    const pageSignatures = signatures.slice(0, pageSize);

    return {
      items: await this.decodeWalletActivity(pageSignatures),
      nextBefore: hasMore
        ? pageSignatures[pageSignatures.length - 1]?.signature ?? null
        : null,
      hasMore,
    };
  }

  async findLatestClaimRequest(
    bounty: DecodedMergePayWorkflow,
    limit = CLAIM_DISCOVERY_PAGE_SIZE,
  ): Promise<MergePayClaimRequest | null> {
    const pageSize = Math.min(Math.max(Math.trunc(limit), 1), 25);
    const signatures = await this.rpc.getSignaturesForAddressPage(
      bounty.address,
      pageSize,
    );
    const activity = await this.decodeWalletActivity(signatures);

    for (const item of activity) {
      if (
        item.status !== "confirmed" ||
        item.legacyInstruction ||
        item.action !== "request_claim" ||
        item.relatedWorkflowAddress !== bounty.address ||
        !item.workflowAddress ||
        !item.workflowPayer ||
        !item.workflowSlug ||
        !isWorkflowSlugHex(item.workflowSlug)
      ) {
        continue;
      }

      const expectedClaim = deriveWorkflowPda(
        this.programId,
        item.workflowPayer,
        item.workflowSlug,
      );
      if (expectedClaim.address !== item.workflowAddress) continue;

      try {
        const claim = await this.getWorkflowByAddress(item.workflowAddress);
        if (!claim || !claimRequestMatchesBounty(claim, bounty)) continue;

        return {
          signature: item.signature,
          blockHeight: item.blockHeight,
          blockTime: item.blockTime,
          claim,
        };
      } catch {
        // A malformed or unavailable candidate must never unlock approval.
      }
    }

    return null;
  }

  async getWalletSettlementPage(
    address: string,
    options: MergePaySettlementPageOptions = {},
  ): Promise<MergePaySettlementPage> {
    const pageSize = Math.min(Math.max(Math.trunc(options.limit ?? 8), 1), 12);
    const items: MergePaySettlementItem[] = [];
    const seenWorkflows = new Set<string>();
    let before = options.before;
    let nextBefore: string | null = null;
    let hasMore = false;
    let scannedTransactions = 0;

    // Settlement history is derived from wallet signatures, so an unbounded
    // search makes an empty page surprisingly expensive. Read a small recent
    // window and let the cursor-driven Next button continue older history.
    // This keeps the first load bounded while preserving older history.
    for (
      let pageNumber = 0;
      pageNumber < SETTLEMENT_MAX_SCAN_PAGES;
      pageNumber += 1
    ) {
      const signatures = await this.rpc.getSignaturesForAddressPage(
        address,
        SETTLEMENT_SOURCE_PAGE_SIZE + 1,
        before,
      );
      if (signatures.length === 0) {
        nextBefore = null;
        hasMore = false;
        break;
      }

      const pageSignatures = signatures.slice(0, SETTLEMENT_SOURCE_PAGE_SIZE);
      const activity = await this.decodeWalletActivity(pageSignatures);
      scannedTransactions += pageSignatures.length;
      const candidates = await Promise.all(
        activity.map((item) => this.decodeWalletSettlement(address, item)),
      );

      let pageComplete = true;
      for (const [index, candidate] of candidates.entries()) {
        if (!candidate || seenWorkflows.has(candidate.workflowAddress)) continue;
        seenWorkflows.add(candidate.workflowAddress);
        items.push(candidate);

        if (items.length >= pageSize) {
          const cursor = pageSignatures[index]?.signature ?? null;
          nextBefore = cursor;
          hasMore = Boolean(
            cursor &&
              (index < pageSignatures.length - 1 ||
                signatures.length > SETTLEMENT_SOURCE_PAGE_SIZE),
          );
          pageComplete = false;
          break;
        }
      }

      if (!pageComplete) break;

      nextBefore = pageSignatures[pageSignatures.length - 1]?.signature ?? null;
      hasMore = signatures.length > SETTLEMENT_SOURCE_PAGE_SIZE;
      if (!hasMore || !nextBefore) break;
      before = nextBefore;
    }

    return {
      items,
      nextBefore: hasMore ? nextBefore : null,
      hasMore: Boolean(hasMore && nextBefore),
      scannedTransactions,
    };
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
        relatedWorkflowAddress:
          mergePayInstruction?.relatedWorkflowAddress ?? null,
        workflowSlug: mergePayInstruction?.workflowSlug ?? null,
        workflowPayer: mergePayInstruction?.workflowPayer ?? null,
        legacyInstruction: mergePayInstruction?.legacyInstruction ?? false,
        feeKelvin: transaction?.meta.fee ?? null,
      };
    });
  }

  private async decodeWalletSettlement(
    address: string,
    item: MergePayActivityItem,
  ): Promise<MergePaySettlementItem | null> {
    if (item.status !== "confirmed" || item.legacyInstruction || item.action === "network") {
      return null;
    }

    const workflowAddress = item.action === "request_claim"
      ? item.relatedWorkflowAddress
      : item.workflowAddress;
    if (workflowAddress === null) return null;

    const workflowSlug = item.action === "request_claim" ? null : item.workflowSlug;
    if (workflowSlug !== null && !isWorkflowSlugHex(workflowSlug)) return null;

    const workflow = await this.getWorkflowByAddressCached(workflowAddress);
    if (
      !workflow ||
      workflow.state.claimRequest ||
      workflow.state.paid && workflow.state.refunded ||
      workflow.state.paid && !workflow.state.mergeConfirmed ||
      workflow.state.refunded && !workflow.state.funded
    ) {
      return null;
    }

    if (workflowSlug !== null) {
      const expectedWorkflow = deriveWorkflowPda(
        this.programId,
        workflow.state.sponsor,
        workflowSlug,
      );
      if (expectedWorkflow.address !== workflow.address) return null;
    }

    const role = address === workflow.state.beneficiary
      ? "beneficiary"
      : address === workflow.state.sponsor
        ? "sponsor"
        : null;
    if (!role) return null;

    const outcome: MergePaySettlementOutcome | null =
      workflow.state.paid && workflow.state.mergeConfirmed
        ? "paid"
        : workflow.state.refunded
          ? "refunded"
          : null;
    if (!outcome) return null;

    return {
      signature: item.signature,
      blockHeight: item.blockHeight,
      blockTime: item.blockTime,
      outcome,
      role,
      action: item.action,
      workflowAddress: workflow.address,
      workflowSlug,
      workflow,
    };
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
    const now = Date.now();
    const cached = this.transactionCache.get(signature);
    if (cached && cached.expiresAt > now) return cached.promise;

    const promise = this.getTransaction(signature).catch(() => null);
    this.transactionCache.set(signature, {
      promise,
      expiresAt: now + TRANSACTION_CACHE_TTL_MS,
    });
    this.trimReadCache(this.transactionCache);
    return promise;
  }

  private getWorkflowByAddressCached(
    address: string,
  ): Promise<DecodedMergePayWorkflow | null> {
    const now = Date.now();
    const cached = this.workflowCache.get(address);
    if (cached && cached.expiresAt > now) return cached.promise;

    let promise: Promise<DecodedMergePayWorkflow | null>;
    promise = this.getWorkflowByAddress(address).catch((error: unknown) => {
      const current = this.workflowCache.get(address);
      if (current?.promise === promise) this.workflowCache.delete(address);
      throw error;
    });
    this.workflowCache.set(address, {
      promise,
      expiresAt: now + WORKFLOW_CACHE_TTL_MS,
    });
    this.trimReadCache(this.workflowCache);
    return promise;
  }

  private trimReadCache<T>(cache: Map<string, TimedPromise<T>>): void {
    while (cache.size > MAX_READ_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }
}

function findMergePayInstruction(
  transaction: MergePayTransactionResponse,
  programId: string,
): {
  action: MergePayInstructionName;
  workflowAddress: string | null;
  relatedWorkflowAddress: string | null;
  workflowSlug: string | null;
  workflowPayer: string | null;
  legacyInstruction: boolean;
} | null {
  for (const instruction of transaction.transaction.message.instructions) {
    const invokedProgram =
      transaction.transaction.message.accountKeys[instruction.programIdIndex];
    if (invokedProgram !== programId) continue;

    const decodedInstruction = decodeInstructionPayload(instruction.data);
    if (!decodedInstruction) continue;
    const payerIndex = instruction.accounts[0];
    const workflowPayer =
      payerIndex === undefined
        ? null
        : transaction.transaction.message.accountKeys[payerIndex] ?? null;

    const workflowAccountIndex = instruction.accounts[1];
    const relatedWorkflowAddress =
      decodedInstruction.action === "request_claim"
        ? decodeRequestClaimTarget(
            decodedInstruction.bytes,
            instruction.accounts[3] === undefined
              ? null
              : transaction.transaction.message.accountKeys[
                  instruction.accounts[3]
                ] ?? null,
          )
        : null;
    return {
      action: decodedInstruction.action,
      workflowAddress:
        workflowAccountIndex === undefined
          ? null
          : transaction.transaction.message.accountKeys[workflowAccountIndex] ?? null,
      relatedWorkflowAddress,
      workflowSlug: decodeWorkflowSlug(decodedInstruction.bytes),
      workflowPayer,
      legacyInstruction: decodedInstruction.legacy,
    };
  }

  return null;
}

function decodeRequestClaimTarget(
  bytes: Uint8Array,
  accountTarget: string | null,
): string | null {
  if (bytes.byteLength < REQUEST_CLAIM_TARGET_OFFSET + 32) return null;

  try {
    const payloadTarget = PublicKey.fromBytes(
      bytes.slice(
        REQUEST_CLAIM_TARGET_OFFSET,
        REQUEST_CLAIM_TARGET_OFFSET + 32,
      ),
    ).toString();

    // The runtime account list is payer, claim PDA, system program, then target.
    // Requiring both representations to agree prevents a malformed transaction
    // from being treated as a claim for an unrelated bounty.
    return accountTarget === null || accountTarget === payloadTarget
      ? payloadTarget
      : null;
  } catch {
    return null;
  }
}

function claimRequestMatchesBounty(
  claim: DecodedMergePayWorkflow,
  bounty: DecodedMergePayWorkflow,
): boolean {
  return (
    claim.state.initialized &&
    claim.state.claimRequest &&
    !claim.state.funded &&
    !claim.state.mergeConfirmed &&
    !claim.state.paid &&
    !claim.state.refunded &&
    claim.state.claimTarget === bounty.address &&
    claim.state.sponsor === bounty.state.sponsor &&
    claim.state.beneficiary !== MERGEPAY_UNASSIGNED_BENEFICIARY &&
    claim.state.githubOwner === bounty.state.githubOwner &&
    claim.state.githubRepo === bounty.state.githubRepo &&
    claim.state.pullNumber === bounty.state.pullNumber &&
    claim.state.amountKelvin === bounty.state.amountKelvin &&
    claim.state.deadlineUnixMs === bounty.state.deadlineUnixMs &&
    claim.state.claimantGithubId !== 0n
  );
}

function decodeWorkflowSlug(bytes: Uint8Array): string | null {
  if (bytes.byteLength < 36) return null;
  return Array.from(bytes.slice(4, 36), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function decodeInstructionPayload(
  data: string,
): { action: MergePayInstructionName; legacy: boolean; bytes: Uint8Array } | null {
  for (const bytes of decodeInstructionDataCandidates(data)) {
    const decoded = decodeInstructionNameBytes(bytes);
    if (decoded) return { ...decoded, bytes };
  }
  return null;
}

function decodeInstructionNameBytes(
  bytes: Uint8Array,
): { action: MergePayInstructionName; legacy: boolean } | null {
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

function decodeInstructionDataCandidates(data: string): Uint8Array[] {
  const candidates: Uint8Array[] = [];
  try {
    candidates.push(decodeBase58(data, "transaction instruction"));
  } catch {
    // Try the RPC's base64 representation below.
  }
  try {
    candidates.push(decodeBase64(data, "transaction instruction"));
  } catch {
    // The transaction payload is invalid or uses an unsupported encoding.
  }
  return candidates;
}

function isWorkflowSlugHex(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

export function createMergePayClient(
  options: MergePayClientOptions = {},
): MergePayClient {
  return new MergePayClient(options);
}
