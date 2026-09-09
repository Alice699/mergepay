"use client";

import {
  type TransactionExecutor,
  useTransaction,
} from "@/hooks/use-transaction";
import { useNetwork } from "@/hooks/use-network";
import { useWallet } from "@/hooks/use-wallet";
import { FUND_TRANSACTION_FEE_BUFFER_KELVIN } from "@/lib/constants";
import { MergePayUiError } from "@/lib/errors";
import { formatRlo } from "@/lib/format";

export interface FundBountyInput {
  workflowSlug: string;
  sponsor: string;
}

export interface FundBountyResult {
  signature: string;
  workflowAddress: string;
  amountKelvin: bigint;
}

export type FundBountyExecutor = TransactionExecutor<
  FundBountyInput,
  FundBountyResult
>;

// This versioned compatibility envelope makes Venus resize workflow storage
// before escrow enters the PDA. Public GitHub merge status is then read through
// a plain, fixed-domain REX request and needs no expiring installation token.
const FUNDING_PREPARATION_ENVELOPE = Uint8Array.from([
  2,
  2, 0, 0, 0, 2, 0,
  2, 0, 0, 0, 2, 0,
]);

export function useFundBounty() {
  const wallet = useWallet();
  const network = useNetwork();

  const executor: FundBountyExecutor = async ({ workflowSlug, sponsor }) => {
    wallet.resetTransaction();

    if (!wallet.address) {
      throw new MergePayUiError(
        "Connect the sponsor wallet before funding this bounty.",
        "WALLET_DISCONNECTED",
      );
    }
    if (wallet.address !== sponsor) {
      throw new MergePayUiError(
        "Only the wallet that created this workflow can fund its escrow.",
        "WORKFLOW_SPONSOR_MISMATCH",
      );
    }
    if (network.rpcStatus !== "available") {
      throw new MergePayUiError(
        "Rialo DevNet must be reachable before funding this bounty.",
        "RPC_UNAVAILABLE",
      );
    }

    const workflow = await network.client.getWorkflow(wallet.address, workflowSlug);
    if (!workflow) {
      throw new MergePayUiError(
        "Rialo did not return this workflow account. Refresh the record and try again.",
        "WORKFLOW_NOT_FOUND",
      );
    }
    if (workflow.state.sponsor !== wallet.address) {
      throw new MergePayUiError(
        "The active wallet does not match the sponsor stored on-chain.",
        "WORKFLOW_SPONSOR_MISMATCH",
      );
    }
    if (workflow.state.funded || workflow.state.paid || workflow.state.refunded) {
      throw new MergePayUiError(
        "This workflow is no longer eligible for initial funding.",
        "WORKFLOW_NOT_FUNDABLE",
      );
    }
    if (workflow.state.deadlineUnixMs <= BigInt(Date.now())) {
      throw new MergePayUiError(
        "This bounty deadline has passed, so new escrow funding is disabled.",
        "WORKFLOW_EXPIRED",
      );
    }

    let liveBalance: bigint;
    try {
      liveBalance = await network.client.rpc.getBalance(wallet.address);
    } catch (cause) {
      throw new MergePayUiError(
        "The sponsor balance could not be refreshed from Rialo DevNet.",
        "BALANCE_UNAVAILABLE",
        { cause: cause instanceof Error ? cause : undefined },
      );
    }

    const requiredBalance =
      workflow.state.amountKelvin + FUND_TRANSACTION_FEE_BUFFER_KELVIN;
    if (liveBalance < requiredBalance) {
      throw new MergePayUiError(
        "The sponsor needs at least " +
          formatRlo(requiredBalance) +
          " RLO to fund the bounty and cover transaction fees.",
        "INSUFFICIENT_FUNDING_BALANCE",
      );
    }

    const githubAuthCiphertext = new Uint8Array(FUNDING_PREPARATION_ENVELOPE);
    const currentSpace = workflow.account.space;
    const ciphertextLength = BigInt(githubAuthCiphertext.length);
    const targetSpace = currentSpace + ciphertextLength;
    if (targetSpace > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new MergePayUiError(
        "The workflow account is too large to resize safely before funding.",
        "WORKFLOW_STORAGE_TOO_LARGE",
      );
    }

    let additionalStorageRent = 0n;
    try {
      const targetRent = await network.client.rpc.getMinimumBalanceForRentExemption(
        Number(targetSpace),
      );
      if (targetRent > workflow.account.kelvin) {
        additionalStorageRent = targetRent - workflow.account.kelvin;
      }
    } catch (cause) {
      throw new MergePayUiError(
        "The workflow storage rent could not be estimated before funding.",
        "WORKFLOW_STORAGE_RENT_UNAVAILABLE",
        { cause: cause instanceof Error ? cause : undefined },
      );
    }

    const requiredFundingBalance = requiredBalance + additionalStorageRent;
    if (liveBalance < requiredFundingBalance) {
      throw new MergePayUiError(
        "The sponsor needs at least " +
          formatRlo(requiredFundingBalance) +
          " RLO to fund the bounty, resize workflow storage, and cover fees.",
        "INSUFFICIENT_FUNDING_BALANCE",
      );
    }

    const prepareInstruction = network.client.buildPrepareFunding({
      payer: wallet.address,
      workflowSlug,
      githubAuthCiphertext,
    });
    const fundInstruction = network.client.buildFund({
      payer: wallet.address,
      workflowSlug,
    });
    const transaction = await network.client.buildTransaction(wallet.address, [
      prepareInstruction,
      fundInstruction,
    ]);
    const confirmation = await wallet.submitTransaction(transaction, {
      action: "Fund bounty",
      summary:
        "Lock " +
        formatRlo(workflow.state.amountKelvin) +
        " RLO for " +
        workflow.state.githubOwner +
        "/" +
        workflow.state.githubRepo +
        " pull request #" +
        workflow.state.pullNumber.toString() +
        ".",
      amountKelvin: workflow.state.amountKelvin.toString(),
      workflowAddress: fundInstruction.workflowPda,
    });

    return {
      signature: confirmation.signature,
      workflowAddress: fundInstruction.workflowPda,
      amountKelvin: workflow.state.amountKelvin,
    };
  };

  const state = useTransaction(executor);
  return { ...state, transaction: wallet.transaction };
}
