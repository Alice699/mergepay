"use client";

import {
  type TransactionExecutor,
  useTransaction,
} from "@/hooks/use-transaction";
import { useNetwork } from "@/hooks/use-network";
import { useWallet } from "@/hooks/use-wallet";
import { formatRlo } from "@/lib/format";
import { MergePayUiError } from "@/lib/errors";

export interface RefundBountyInput {
  workflowSlug: string;
  sponsor: string;
}

export interface RefundBountyResult {
  signature: string;
  workflowAddress: string;
  amountKelvin: bigint;
}

export type RefundBountyExecutor = TransactionExecutor<
  RefundBountyInput,
  RefundBountyResult
>;

export function useRefundBounty() {
  const wallet = useWallet();
  const network = useNetwork();

  const executor: RefundBountyExecutor = async ({ workflowSlug, sponsor }) => {
    wallet.resetTransaction();

    if (!wallet.address) {
      throw new MergePayUiError(
        "Connect the sponsor wallet before refunding this bounty.",
        "WALLET_DISCONNECTED",
      );
    }
    if (wallet.address !== sponsor) {
      throw new MergePayUiError(
        "Only the wallet that created this workflow can recover its escrow.",
        "WORKFLOW_SPONSOR_MISMATCH",
      );
    }
    if (network.rpcStatus !== "available") {
      throw new MergePayUiError(
        "Rialo DevNet must be reachable before refunding this bounty.",
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
    if (!workflow.state.funded) {
      throw new MergePayUiError(
        "This workflow has no funded escrow to refund.",
        "WORKFLOW_NOT_FUNDED",
      );
    }
    if (workflow.state.paid || workflow.state.mergeConfirmed) {
      throw new MergePayUiError(
        "This bounty was already paid and can no longer be refunded.",
        "WORKFLOW_ALREADY_PAID",
      );
    }
    if (workflow.state.refunded) {
      throw new MergePayUiError(
        "This escrow has already been returned to its sponsor.",
        "WORKFLOW_ALREADY_REFUNDED",
      );
    }
    if (BigInt(Date.now()) <= workflow.state.deadlineUnixMs) {
      throw new MergePayUiError(
        "The bounty deadline has not passed yet. Refund becomes available after expiry.",
        "WORKFLOW_NOT_EXPIRED",
      );
    }

    const instruction = network.client.buildRefund({
      payer: wallet.address,
      workflowSlug,
    });
    const transaction = await network.client.buildTransaction(wallet.address, [
      instruction,
    ]);
    const confirmation = await wallet.submitTransaction(transaction, {
      action: "Refund expired bounty",
      summary:
        "Return " +
        formatRlo(workflow.state.amountKelvin) +
        " RLO from the expired " +
        workflow.state.githubOwner +
        "/" +
        workflow.state.githubRepo +
        " pull request #" +
        workflow.state.pullNumber.toString() +
        " escrow to its sponsor.",
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
