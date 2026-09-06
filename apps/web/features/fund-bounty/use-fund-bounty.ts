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

    const instruction = network.client.buildFund({
      payer: wallet.address,
      workflowSlug,
    });
    const transaction = await network.client.buildTransaction(wallet.address, [
      instruction,
    ]);
    const confirmation = await wallet.submitTransaction(transaction, {
      action: "Fund bounty",
      summary:
        "Lock " +
        workflow.state.amountKelvin.toString() +
        " kelvin for " +
        workflow.state.githubOwner +
        "/" +
        workflow.state.githubRepo +
        " pull request #" +
        workflow.state.pullNumber.toString() +
        ".",
      amountKelvin: workflow.state.amountKelvin.toString(),
      workflowAddress: instruction.workflowPda,
    });

    return {
      signature: confirmation.signature,
      workflowAddress: instruction.workflowPda,
      amountKelvin: workflow.state.amountKelvin,
    };
  };

  const state = useTransaction(executor);
  return { ...state, transaction: wallet.transaction };
}
