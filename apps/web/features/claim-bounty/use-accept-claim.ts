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
import { verifyGitHubClaimAuthor } from "@/lib/github-claim-review";
import {
  claimMatchesBountyTerms,
  githubReviewMatchesClaim,
} from "@/features/claim-bounty/claim-review";

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
        "The detected claim record is not available on Rialo yet. Refresh claim discovery and try again after confirmation.",
        "CLAIM_RECORD_NOT_FOUND",
      );
    }
    if (account.owner !== network.client.programId) {
      throw new MergePayUiError(
        "The detected account is not owned by the active MergePay program, so approval was blocked.",
        "CLAIM_RECORD_OWNER_MISMATCH",
      );
    }

    let claim: DecodedMergePayWorkflow;
    try {
      claim = decodeWorkflowAccount(account, network.client.programId);
    } catch (cause) {
      throw new MergePayUiError(
        "The detected account could not be decoded as a valid MergePay claim record, so approval was blocked.",
        "CLAIM_RECORD_INVALID",
        { cause: cause instanceof Error ? cause : undefined },
      );
    }
    if (!claimMatchesBountyTerms(claim, bounty)) {
      throw new MergePayUiError(
        "This claim record does not match the bounty terms and was not approved.",
        "CLAIM_TERMS_MISMATCH",
      );
    }

    let githubReview;
    try {
      githubReview = await verifyGitHubClaimAuthor({
        owner: claim.state.githubOwner,
        repo: claim.state.githubRepo,
        number: claim.state.pullNumber,
        claimantGithubId: claim.state.claimantGithubId,
        claimantGithubLogin: claim.state.claimantGithub,
      });
    } catch (cause) {
      throw new MergePayUiError(
        "GitHub could not re-check the pull-request author. Approval stays locked until the public PR is available.",
        "CLAIM_GITHUB_REVIEW_UNAVAILABLE",
        { cause: cause instanceof Error ? cause : undefined },
      );
    }

    if (!githubReviewMatchesClaim(githubReview, claim)) {
      throw new MergePayUiError(
        "The GitHub review response does not match this claim record. Refresh the review before approving.",
        "CLAIM_GITHUB_REVIEW_INVALID",
      );
    }
    if (!githubReview.verification.authorIdMatches) {
      throw new MergePayUiError(
        `GitHub reports @${githubReview.author.login} as the pull-request author, but this claim records @${claim.state.claimantGithub}. Approval was blocked.`,
        "CLAIM_GITHUB_AUTHOR_MISMATCH",
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
