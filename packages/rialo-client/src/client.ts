import {
  MERGEPAY_PROGRAM_ID,
  DEFAULT_RIALO_NETWORK,
  MERGEPAY_CALLBACK_DISCRIMINANT,
  MERGEPAY_INSTRUCTION_DISCRIMINANTS,
  MERGEPAY_UNASSIGNED_BENEFICIARY,
} from "./constants.js";
import { decodeWorkflowAccount } from "./accounts/index.js";
import {
  classifyWorkflowLifecycle,
  type MergePayWorkflowLifecycle,
} from "./lifecycle.js";
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

export type MergePayRexSignal = "merged" | "not_merged" | "inconclusive";

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
  rexSignal: MergePayRexSignal | null;
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
  incomplete: boolean;
  readErrors: number;
}

export interface MergePaySettlementPageOptions {
  limit?: number;
  before?: string;
}

interface TimedPromise<T> {
  expiresAt: number;
  promise: Promise<T>;
}

const SETTLEMENT_SOURCE_PAGE_SIZE = 24;
const SETTLEMENT_MAX_SCAN_PAGES = 2;
const CLAIM_DISCOVERY_PAGE_SIZE = 12;
const REQUEST_CLAIM_TARGET_OFFSET = 4 + 32;
const TRANSACTION_CACHE_TTL_MS = 5 * 60_000;
const WORKFLOW_CACHE_TTL_MS = 5_000;
const MAX_READ_CACHE_ENTRIES = 256;
const DIAGNOSTIC_CHECK_REVIEW_AFTER_MS = 10 * 60_000;
const DIAGNOSTIC_ACTIVITY_SAMPLE_SIZE = 8;
const DIAGNOSTIC_WORKFLOW_CONCURRENCY = 4;

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

export type MergePayDiagnosticSeverity =
  | "healthy"
  | "notice"
  | "warning"
  | "critical";

export type MergePayDiagnosticFinding =
  | "none"
  | "account_unavailable"
  | "read_incomplete"
  | "pda_mismatch"
  | "invalid_state"
  | "transaction_failed"
  | "rex_inconclusive"
  | "rex_failures_repeated"
  | "refund_overdue"
  | "settlement_incomplete"
  | "check_needs_review"
  | "expired_unfunded";

export interface MergePayWorkflowReliability {
  sampledTransactions: number;
  failedTransactions: number;
  consecutiveIssues: number;
  recentMergeChecks: number;
  inconclusiveRexReports: number;
  notMergedRexReports: number;
  mergedRexReports: number;
  latestRexSignal: MergePayRexSignal | null;
  lastConfirmedActivity: bigint | null;
}

export interface MergePayWorkflowDiagnostic {
  network: RialoNetwork;
  workflowAddress: string;
  workflowSlug: string;
  sponsor: string;
  workflow: DecodedMergePayWorkflow | null;
  lifecycle: MergePayWorkflowLifecycle | "unavailable";
  severity: MergePayDiagnosticSeverity;
  finding: MergePayDiagnosticFinding;
  message: string;
  createdSignature: string;
  createdBlockHeight: bigint;
  createdBlockTime: bigint | null;
  latestActivity: MergePayActivityItem | null;
  reliability: MergePayWorkflowReliability;
  readError: string | null;
}

export interface MergePayDiagnosticPage {
  items: MergePayWorkflowDiagnostic[];
  nextBefore: string | null;
  hasMore: boolean;
  scannedTransactions: number;
  incomplete: boolean;
  readErrors: number;
}

export interface MergePayDiagnosticPageOptions {
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
    return (await this.findClaimRequests(bounty, limit))[0] ?? null;
  }

  async findClaimRequests(
    bounty: DecodedMergePayWorkflow,
    limit = CLAIM_DISCOVERY_PAGE_SIZE,
  ): Promise<MergePayClaimRequest[]> {
    const pageSize = Math.min(Math.max(Math.trunc(limit), 1), 25);
    const signatures = await this.rpc.getSignaturesForAddressPage(
      bounty.address,
      pageSize,
    );
    const activity = await this.decodeWalletActivity(signatures);
    const requests: MergePayClaimRequest[] = [];
    const seenClaims = new Set<string>();

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
      if (
        expectedClaim.address !== item.workflowAddress ||
        seenClaims.has(item.workflowAddress)
      ) {
        continue;
      }

      try {
        const claim = await this.getWorkflowByAddress(item.workflowAddress);
        if (!claim || !claimRequestMatchesBounty(claim, bounty)) continue;

        seenClaims.add(item.workflowAddress);
        requests.push({
          signature: item.signature,
          blockHeight: item.blockHeight,
          blockTime: item.blockTime,
          claim,
        });
      } catch {
        // A malformed or unavailable candidate must never unlock approval.
      }
    }

    return requests;
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
    let readErrors = 0;

    // Settlement history is derived from wallet signatures. Scan up to two
    // full Rialo pages so ordinary wallet traffic does not push a verified
    // receipt out of the first result, then expose the exact raw cursor for
    // older history. The bound keeps an empty account read predictable.
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
      const activityBatch = await this.decodeWalletActivityBatch(pageSignatures);
      const activity = activityBatch.items;
      readErrors += activityBatch.unreadableTransactions;
      scannedTransactions += pageSignatures.length;
      const candidateResults = await Promise.all(
        activity.map(async (item) => {
          try {
            return {
              candidate: await this.decodeWalletSettlement(address, item),
              failed: false,
            };
          } catch {
            return { candidate: null, failed: true };
          }
        }),
      );
      readErrors += candidateResults.filter((result) => result.failed).length;
      const candidates = candidateResults.map((result) => result.candidate);

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
      incomplete: readErrors > 0,
      readErrors,
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

  async getWorkflowDiagnosticsPage(
    options: MergePayDiagnosticPageOptions = {},
  ): Promise<MergePayDiagnosticPage> {
    const pageSize = Math.min(Math.max(Math.trunc(options.limit ?? 25), 1), 25);
    const signatures = await this.rpc.getSignaturesForAddressPage(
      this.programId,
      pageSize,
      options.before,
    );
    const activityBatch = await this.decodeWalletActivityBatch(signatures);
    const candidates = activityBatch.items.filter(
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
        item.workflowPayer !== null &&
        isWorkflowSlugHex(item.workflowSlug),
    );

    let readErrors = activityBatch.unreadableTransactions;
    const seen = new Set<string>();
    const now = Date.now();
    const diagnosticResults = await mapWithConcurrency(
      candidates,
      DIAGNOSTIC_WORKFLOW_CONCURRENCY,
      async (item) => {
        if (seen.has(item.workflowAddress)) return null;
        seen.add(item.workflowAddress);

        const expectedWorkflow = deriveWorkflowPda(
          this.programId,
          item.workflowPayer,
          item.workflowSlug,
        );
        if (expectedWorkflow.address !== item.workflowAddress) {
          return createWorkflowDiagnostic({
            network: this.network,
            item,
            workflow: null,
            latestActivity: item,
            activitySample: [item],
            readError: null,
            now,
            pdaMatches: false,
          });
        }

        const [workflowResult, signaturesResult] = await Promise.allSettled([
          this.getWorkflowByAddress(item.workflowAddress),
          this.rpc.getSignaturesForAddressPage(
            item.workflowAddress,
            DIAGNOSTIC_ACTIVITY_SAMPLE_SIZE,
          ),
        ]);

        let localReadErrors = 0;
        const errors: string[] = [];
        let workflow: DecodedMergePayWorkflow | null = null;
        if (workflowResult.status === "fulfilled") {
          workflow = workflowResult.value;
          if (workflow === null) {
            localReadErrors += 1;
            errors.push("The workflow account is not currently available from Rialo.");
          }
        } else {
          localReadErrors += 1;
          errors.push(errorMessage(workflowResult.reason));
        }

        let activitySample: MergePayActivityItem[] = [item];
        let latestActivity: MergePayActivityItem | null = item;
        if (signaturesResult.status === "fulfilled") {
          const lifecycle = workflow
            ? classifyWorkflowLifecycle(workflow.state)
            : "unavailable";
          const sampleSize =
            lifecycle === "funded" || lifecycle === "merge_confirmed"
              ? DIAGNOSTIC_ACTIVITY_SAMPLE_SIZE
              : 1;
          const sampledSignatures = signaturesResult.value.slice(0, sampleSize);
          if (sampledSignatures.length > 0) {
            const activityBatch = await this.decodeWalletActivityBatch(
              sampledSignatures,
            );
            activitySample = activityBatch.items;
            latestActivity = activitySample[0] ?? item;
            localReadErrors += activityBatch.unreadableTransactions;
            if (activityBatch.unreadableTransactions > 0) {
              errors.push(
                `${activityBatch.unreadableTransactions} recent workflow transaction read${activityBatch.unreadableTransactions === 1 ? "" : "s"} could not be decoded.`,
              );
            }
          }
        } else {
          localReadErrors += 1;
          errors.push(errorMessage(signaturesResult.reason));
        }

        readErrors += localReadErrors;
        return createWorkflowDiagnostic({
          network: this.network,
          item,
          workflow,
          latestActivity,
          activitySample,
          readError: errors.length > 0 ? errors.join(" ") : null,
          now,
          pdaMatches: true,
        });
      },
    );

    const nextBefore =
      signatures.length === pageSize
        ? signatures[signatures.length - 1]?.signature ?? null
        : null;

    return {
      items: diagnosticResults
        .filter(
          (record): record is MergePayWorkflowDiagnostic => record !== null,
        )
        .sort((left, right) =>
          left.createdBlockHeight < right.createdBlockHeight ? 1 : -1,
        ),
      nextBefore,
      hasMore: nextBefore !== null,
      scannedTransactions: signatures.length,
      incomplete: readErrors > 0,
      readErrors,
    };
  }

  private async decodeWalletActivity(
    signatures: Awaited<ReturnType<MergePayRpcClient["getSignaturesForAddress"]>>,
  ): Promise<MergePayActivityItem[]> {
    return (await this.decodeWalletActivityBatch(signatures)).items;
  }

  private async decodeWalletActivityBatch(
    signatures: Awaited<ReturnType<MergePayRpcClient["getSignaturesForAddress"]>>,
  ): Promise<{
    items: MergePayActivityItem[];
    unreadableTransactions: number;
  }> {
    const records = await Promise.all(
      signatures.map(async (signatureInfo) => ({
        signatureInfo,
        transaction: await this.getTransactionSafely(signatureInfo.signature),
      })),
    );

    return {
      items: records.map(({ signatureInfo, transaction }) => {
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
          rexSignal: classifyRexSignal(transaction?.meta.logMessages),
        };
      }),
      unreadableTransactions: records.reduce(
        (count, record) => count + (record.transaction ? 0 : 1),
        0,
      ),
    };
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

    let promise: Promise<MergePayTransactionResponse | null>;
    promise = Promise.resolve()
      .then(() => this.getTransaction(signature))
      .then((transaction) => {
        if (!transaction) {
          const current = this.transactionCache.get(signature);
          if (current?.promise === promise) this.transactionCache.delete(signature);
        }
        return transaction;
      })
      .catch(() => {
        const current = this.transactionCache.get(signature);
        if (current?.promise === promise) this.transactionCache.delete(signature);
        return null;
      });
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
    claim.state.expectedHeadSha === bounty.state.expectedHeadSha &&
    claim.state.expectedBaseRef === bounty.state.expectedBaseRef &&
    claim.state.requireCiSuccess === bounty.state.requireCiSuccess &&
    claim.state.minimumApprovals === bounty.state.minimumApprovals &&
    claim.state.rexBytecodeAccount === bounty.state.rexBytecodeAccount &&
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
  // Native run_merge_check callbacks remain valid in activity history. The
  // user-triggered check action itself uses the public check_merge control ABI.
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
  const lifecycle = classifyWorkflowLifecycle(state);
  if (
    !/^[A-Za-z0-9._-]{1,100}$/.test(state.githubOwner) ||
    !/^[A-Za-z0-9._-]{1,100}$/.test(state.githubRepo) ||
    state.pullNumber <= 0n ||
    state.amountKelvin <= 0n ||
    state.deadlineUnixMs <= now ||
    lifecycle === "uninitialized" ||
    lifecycle === "claim_request" ||
    lifecycle === "paid" ||
    lifecycle === "refunded" ||
    lifecycle === "invalid"
  ) {
    return null;
  }
  if (lifecycle === "merge_confirmed") return "merge_confirmed";
  if (lifecycle === "funded") return "funded";
  if (lifecycle === "claimed") return "claimed";
  return lifecycle === "created" ? "open" : null;
}

function createWorkflowDiagnostic({
  network,
  item,
  workflow,
  latestActivity,
  activitySample,
  readError,
  now,
  pdaMatches,
}: {
  network: RialoNetwork;
  item: MergePayActivityItem & {
    action: "create_bounty";
    workflowAddress: string;
    workflowSlug: string;
    workflowPayer: string;
  };
  workflow: DecodedMergePayWorkflow | null;
  latestActivity: MergePayActivityItem | null;
  activitySample: readonly MergePayActivityItem[];
  readError: string | null;
  now: number;
  pdaMatches: boolean;
}): MergePayWorkflowDiagnostic {
  const reliability = summarizeWorkflowReliability(activitySample);
  const base = {
    network,
    workflowAddress: item.workflowAddress,
    workflowSlug: item.workflowSlug,
    sponsor: item.workflowPayer,
    workflow,
    createdSignature: item.signature,
    createdBlockHeight: item.blockHeight,
    createdBlockTime: item.blockTime,
    latestActivity,
    reliability,
    readError,
  };

  if (!pdaMatches) {
    return {
      ...base,
      lifecycle: "invalid",
      severity: "critical",
      finding: "pda_mismatch",
      message: "The recorded workflow address does not match the derived program address.",
    };
  }
  if (!workflow) {
    return {
      ...base,
      lifecycle: "unavailable",
      severity: "critical",
      finding: "account_unavailable",
      message: "The creation transaction is confirmed, but its workflow account could not be verified.",
    };
  }

  const lifecycle = classifyWorkflowLifecycle(workflow.state);
  if (
    workflow.state.sponsor !== item.workflowPayer ||
    workflow.address !== item.workflowAddress ||
    lifecycle === "invalid" ||
    lifecycle === "uninitialized" ||
    lifecycle === "claim_request"
  ) {
    return {
      ...base,
      lifecycle: "invalid",
      severity: "critical",
      finding: "invalid_state",
      message: "The decoded account identity or lifecycle is inconsistent with its creation proof.",
    };
  }

  if (lifecycle === "merge_confirmed") {
    return {
      ...base,
      lifecycle,
      severity: "critical",
      finding: "settlement_incomplete",
      message: "Merge confirmation is recorded without a completed payout.",
    };
  }

  if (
    lifecycle === "funded" &&
    workflow.state.deadlineUnixMs <= BigInt(now)
  ) {
    return {
      ...base,
      lifecycle,
      severity: "critical",
      finding: "refund_overdue",
      message: "Funded escrow remains locked after the workflow deadline.",
    };
  }

  if (latestActivity?.status === "failed") {
    return {
      ...base,
      lifecycle,
      severity: "warning",
      finding: "transaction_failed",
      message:
        reliability.failedTransactions > 1
          ? `${reliability.failedTransactions} of the ${reliability.sampledTransactions} sampled workflow transactions failed. State remains unchanged and should be reviewed.`
          : "The latest workflow transaction failed and may need another read or retry.",
    };
  }

  if (
    lifecycle === "funded" &&
    reliability.inconclusiveRexReports >= 2 &&
    reliability.consecutiveIssues >= 2
  ) {
    return {
      ...base,
      lifecycle,
      severity: "warning",
      finding: "rex_failures_repeated",
      message: `${reliability.inconclusiveRexReports} sampled REX reports were inconclusive. Escrow remains locked and the native heartbeat can retry safely.`,
    };
  }

  if (
    lifecycle === "funded" &&
    reliability.latestRexSignal === "inconclusive"
  ) {
    return {
      ...base,
      lifecycle,
      severity: "warning",
      finding: "rex_inconclusive",
      message: "The latest REX report was inconclusive. This is not proof that the pull request is unmerged, so escrow remains locked.",
    };
  }

  if (readError) {
    return {
      ...base,
      lifecycle,
      severity: "warning",
      finding: "read_incomplete",
      message: "The workflow account is valid, but its latest activity could not be read completely.",
    };
  }

  const latestActivityMs = blockTimeToUnixMs(latestActivity?.blockTime ?? null);
  if (
    lifecycle === "funded" &&
    workflow.state.checks > 0n &&
    latestActivity?.action === "check_merge" &&
    latestActivityMs !== null &&
    now - latestActivityMs >= DIAGNOSTIC_CHECK_REVIEW_AFTER_MS
  ) {
    return {
      ...base,
      lifecycle,
      severity: "warning",
      finding: "check_needs_review",
      message:
        reliability.latestRexSignal === "not_merged"
          ? "The last REX proof was validly not merged, but no newer heartbeat was observed within ten minutes. Escrow remains locked."
          : "No terminal account update followed the latest merge check within ten minutes.",
    };
  }

  if (
    (lifecycle === "created" || lifecycle === "claimed") &&
    workflow.state.deadlineUnixMs <= BigInt(now)
  ) {
    return {
      ...base,
      lifecycle,
      severity: "notice",
      finding: "expired_unfunded",
      message: "The bounty expired before escrow funding, so no value is locked.",
    };
  }

  return {
    ...base,
    lifecycle,
    severity: "healthy",
    finding: "none",
    message:
      lifecycle === "paid" || lifecycle === "refunded"
        ? "Terminal workflow state is internally consistent."
        : lifecycle === "funded" &&
            reliability.latestRexSignal === "not_merged"
          ? "The latest REX proof says the pull request is not merged. Escrow remains locked and the native heartbeat stays active."
        : "The latest verified workflow state requires no intervention.",
  };
}

function summarizeWorkflowReliability(
  activity: readonly MergePayActivityItem[],
): MergePayWorkflowReliability {
  let consecutiveIssues = 0;
  for (const item of activity) {
    if (item.status === "failed" || item.rexSignal === "inconclusive") {
      consecutiveIssues += 1;
    } else {
      break;
    }
  }

  return {
    sampledTransactions: activity.length,
    failedTransactions: activity.filter(({ status }) => status === "failed").length,
    consecutiveIssues,
    recentMergeChecks: activity.filter(({ action }) => action === "check_merge").length,
    inconclusiveRexReports: activity.filter(
      ({ rexSignal }) => rexSignal === "inconclusive",
    ).length,
    notMergedRexReports: activity.filter(
      ({ rexSignal }) => rexSignal === "not_merged",
    ).length,
    mergedRexReports: activity.filter(({ rexSignal }) => rexSignal === "merged").length,
    latestRexSignal:
      activity.find(({ rexSignal }) => rexSignal !== null)?.rexSignal ?? null,
    lastConfirmedActivity:
      activity.find(
        ({ status, blockTime }) => status === "confirmed" && blockTime !== null,
      )?.blockTime ?? null,
  };
}

function classifyRexSignal(
  logMessages: readonly string[] | undefined,
): MergePayRexSignal | null {
  if (!logMessages || logMessages.length === 0) return null;
  const logs = logMessages.join("\n").toLowerCase();
  if (logs.includes("mergepay released ")) return "merged";
  if (
    logs.includes("mergepay pr is not merged") ||
    logs.includes("mergepay settlement conditions remain locked: proof status")
  ) return "not_merged";
  if (
    logs.includes("mergepay inconclusive rex error") ||
    logs.includes("mergepay unserializable response") ||
    logs.includes("mergepay received an unsupported rex output") ||
    logs.includes("mergepay received an empty rex report") ||
    logs.includes("mergepay rex report was not unanimous") ||
    logs.includes("mergepay rejected malformed settlement proof") ||
    logs.includes("mergepay rejected invalid settlement proof fields") ||
    logs.includes("mergepay rejected proof that did not reproduce locked policy")
  ) {
    return "inconclusive";
  }
  return null;
}

function blockTimeToUnixMs(value: bigint | null): number | null {
  if (value === null) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric > 100_000_000_000 ? numeric : numeric * 1_000;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index] as T, index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
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
