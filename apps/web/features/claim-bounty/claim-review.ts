import {
  MERGEPAY_UNASSIGNED_BENEFICIARY,
  type DecodedMergePayWorkflow,
} from "@mergepay/rialo-client";
import type { GitHubClaimReview } from "@/lib/github-claim-review";

export function claimMatchesBountyTerms(
  claim: DecodedMergePayWorkflow,
  bounty: DecodedMergePayWorkflow,
): boolean {
  return (
    !bounty.state.claimRequest &&
    bounty.state.beneficiary === MERGEPAY_UNASSIGNED_BENEFICIARY &&
    !bounty.state.funded &&
    !bounty.state.mergeConfirmed &&
    !bounty.state.paid &&
    !bounty.state.refunded &&
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
    claim.state.claimantGithub.trim().length > 0 &&
    claim.state.claimantGithubId > 0n
  );
}

export function githubReviewMatchesClaim(
  review: GitHubClaimReview,
  claim: DecodedMergePayWorkflow,
): boolean {
  return (
    review.target.owner.toLowerCase() ===
      claim.state.githubOwner.toLowerCase() &&
    review.target.repo.toLowerCase() === claim.state.githubRepo.toLowerCase() &&
    review.target.number === Number(claim.state.pullNumber) &&
    review.claim.githubId === claim.state.claimantGithubId.toString() &&
    review.claim.githubLogin.toLowerCase() ===
      claim.state.claimantGithub.toLowerCase()
  );
}

export function hasVerifiedGitHubAuthor(
  review: GitHubClaimReview,
  claim: DecodedMergePayWorkflow,
): boolean {
  return (
    githubReviewMatchesClaim(review, claim) &&
    review.verification.authorIdMatches
  );
}
