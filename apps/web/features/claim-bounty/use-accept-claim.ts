"use client";

import {
  decodeWorkflowAccount,
  MERGEPAY_UNASSIGNED_BENEFICIARY,
  type DecodedMergePayWorkflow,
} from "@mergepay/rialo-client";
import {
  type TransactionExecutor,
  useTransaction,
} from "@/hooks/use-transaction";
import { useNetwork } from "@/hooks/use-network";
import { useWallet } from "@/hooks/use-wallet";
import { MergePayUiError } from "@/lib/errors";

export interface AcceptClaimInput {
  workflowSlug: string;
  claimWorkflow: string;
  bounty: DecodedMergePayWorkflow;
}

export interface AcceptClaimResult {
  signature: string;
  beneficiary: string;
  githubLogin: string;
  githubUserId: bigint;
}

export type AcceptClaimExecutor = TransactionExecutor<
  AcceptClaimInput,
  AcceptClaimResult
>;

export function useAcceptClaim() {
  const wallet = useWallet();
  const network = useNetwork();

  const executor: AcceptClaimExecutor = async ({
    workflowSlug,
    claimWorkflow,
    bounty,
  }) => {
    wallet.resetTransaction();
    if (!wallet.address) {
      throw new MergePayUiError(
        "Connect the sponsor wallet before approving a claim.",
        "WALLET_DISCONNECTED",
      );
    }
    if (wallet.address !== bounty.state.sponsor) {
      throw new MergePayUiError(
        "Only the sponsor wallet can approve this claim.",
        "WORKFLOW_SPONSOR_MISMATCH",
      );
    }
    if (network.rpcStatus !== "available") {
      throw new MergePayUiError(
        "Rialo DevNet must be reachable before approving a claim.",
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
        "This bounty is no longer waiting for a claim approval.",
        "CLAIM_NOT_APPROVABLE",
      );
    }

    const account = await network.client.getAccountInfo(claimWorkflow);
    if (!account) {
      throw new MergePayUiError(
        "The claim record was not found on Rialo. Ask the contributor to send the confirmed claim address.",
        "CLAIM_RECORD_NOT_FOUND",
      );
    }

    let claim: DecodedMergePayWorkflow;
    try {
      claim = decodeWorkflowAccount(account, network.client.programId);
    } catch (cause) {
      throw new MergePayUiError(
        "The claim record could not be decoded from Rialo.",
        "CLAIM_RECORD_INVALID",
        { cause: cause instanceof Error ? cause : undefined },
      );
    }
    if (
      !claim.state.claimRequest ||
      claim.state.claimTarget !== bounty.address ||
      claim.state.sponsor !== bounty.state.sponsor ||
      claim.state.beneficiary === MERGEPAY_UNASSIGNED_BENEFICIARY ||
      claim.state.githubOwner !== bounty.state.githubOwner ||
      claim.state.githubRepo !== bounty.state.githubRepo ||
      claim.state.pullNumber !== bounty.state.pullNumber ||
      claim.state.amountKelvin !== bounty.state.amountKelvin ||
      claim.state.deadlineUnixMs !== bounty.state.deadlineUnixMs ||
      claim.state.claimantGithubId === 0n
    ) {
      throw new MergePayUiError(
        "This claim record does not match the bounty terms and was not approved.",
        "CLAIM_TERMS_MISMATCH",
      );
    }

    const instruction = network.client.buildAcceptClaim({
      payer: wallet.address,
      workflowSlug,
      claimWorkflow,
    });
    const transaction = await network.client.buildTransaction(wallet.address, [
      instruction,
    ]);
    const confirmation = await wallet.submitTransaction(transaction, {
      action: "Approve bounty claim",
      summary:
        "Lock the contributor claim for " +
        bounty.state.githubOwner +
        "/" +
        bounty.state.githubRepo +
        " pull request #" +
        bounty.state.pullNumber.toString() +
        " to @" +
        claim.state.claimantGithub +
        " (GitHub " +
        claim.state.claimantGithubId.toString() +
        ").",
      workflowAddress: instruction.workflowPda,
    });

    return {
      signature: confirmation.signature,
      beneficiary: claim.state.beneficiary,
      githubLogin: claim.state.claimantGithub,
      githubUserId: claim.state.claimantGithubId,
    };
  };

  const state = useTransaction(executor);
  return { ...state, transaction: wallet.transaction };
}
