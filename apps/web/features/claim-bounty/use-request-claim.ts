"use client";

import {
  MERGEPAY_UNASSIGNED_BENEFICIARY,
  type DecodedMergePayWorkflow,
} from "@mergepay/rialo-client";
import {
  type TransactionExecutor,
  useTransaction,
} from "@/hooks/use-transaction";
import { useNetwork } from "@/hooks/use-network";
import { useWallet } from "@/hooks/use-wallet";
import { MINIMUM_CREATE_BALANCE_KELVIN } from "@/lib/constants";
import { MergePayUiError } from "@/lib/errors";
import { formatRlo } from "@/lib/format";

export interface RequestClaimInput {
  workflowSlug: string;
  targetWorkflow: string;
  claimantGithub: string;
  claimantGithubId: number;
  bounty: DecodedMergePayWorkflow;
}

export interface RequestClaimResult {
  signature: string;
  claimWorkflowAddress: string;
  claimWorkflowSlug: string;
}

export type RequestClaimExecutor = TransactionExecutor<
  RequestClaimInput,
  RequestClaimResult
>;

export function useRequestClaim() {
  const wallet = useWallet();
  const network = useNetwork();

  const executor: RequestClaimExecutor = async ({
    workflowSlug,
    targetWorkflow,
    claimantGithub,
    claimantGithubId,
    bounty,
  }) => {
    wallet.resetTransaction();
    if (!wallet.address) {
      throw new MergePayUiError(
        "Connect the contributor wallet before requesting a claim.",
        "WALLET_DISCONNECTED",
      );
    }
    if (wallet.address === bounty.state.sponsor) {
      throw new MergePayUiError(
        "The sponsor wallet cannot claim its own bounty.",
        "CLAIM_SPONSOR_NOT_ALLOWED",
      );
    }
    if (network.rpcStatus !== "available") {
      throw new MergePayUiError(
        "Rialo DevNet must be reachable before requesting a claim.",
        "RPC_UNAVAILABLE",
      );
    }
    if (
      bounty.state.claimRequest ||
      bounty.state.beneficiary !== MERGEPAY_UNASSIGNED_BENEFICIARY ||
      bounty.state.funded ||
      bounty.state.paid ||
      bounty.state.refunded
    ) {
      throw new MergePayUiError(
        "This bounty is no longer open for a contributor claim.",
        "BOUNTY_NOT_CLAIMABLE",
      );
    }
    if (bounty.state.deadlineUnixMs <= BigInt(Date.now())) {
      throw new MergePayUiError(
        "This bounty deadline has passed, so it cannot be claimed.",
        "WORKFLOW_EXPIRED",
      );
    }

    const targetAccount = await network.client.getAccountInfo(targetWorkflow);
    if (!targetAccount) {
      throw new MergePayUiError(
        "The bounty workflow could not be found on the configured Rialo program. Open the bounty again from the current marketplace listing.",
        "WORKFLOW_ACCOUNT_NOT_FOUND",
      );
    }
    if (targetAccount.owner !== network.client.programId) {
      throw new MergePayUiError(
        `This bounty belongs to another MergePay deployment (${targetAccount.owner}). The current marketplace uses ${network.client.programId}. Create a new bounty from the current listing; refreshing cannot migrate an existing workflow.`,
        "WORKFLOW_PROGRAM_MISMATCH",
      );
    }

    const liveBalance = await network.client.rpc.getBalance(wallet.address);
    if (liveBalance < MINIMUM_CREATE_BALANCE_KELVIN) {
      throw new MergePayUiError(
        "The contributor wallet needs at least " +
          formatRlo(MINIMUM_CREATE_BALANCE_KELVIN) +
          " RLO for the claim record and transaction fee.",
        "INSUFFICIENT_FUNDS",
      );
    }

    const instruction = network.client.buildRequestClaim({
      payer: wallet.address,
      workflowSlug,
      targetWorkflow,
      claimantGithub,
      claimantGithubId,
    });
    const transaction = await network.client.buildTransaction(wallet.address, [
      instruction,
    ]);
    const confirmation = await wallet.submitTransaction(transaction, {
      action: "Request bounty claim",
      summary:
        "Link GitHub @" +
        claimantGithub +
        " to " +
        bounty.state.githubOwner +
        "/" +
        bounty.state.githubRepo +
        " pull request #" +
        bounty.state.pullNumber.toString() +
        ".",
      workflowAddress: instruction.workflowPda,
    });

    return {
      signature: confirmation.signature,
      claimWorkflowAddress: instruction.workflowPda,
      claimWorkflowSlug: workflowSlug,
    };
  };

  const state = useTransaction(executor);
  return { ...state, transaction: wallet.transaction };
}
