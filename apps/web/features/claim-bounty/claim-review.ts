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
    claim.state.claimRequest &&
    claim.state.claimTarget === bounty.address &&
    claim.state.sponsor === bounty.state.sponsor &&
    claim.state.beneficiary !== MERGEPAY_UNASSIGNED_BENEFICIARY &&
    claim.state.githubOwner === bounty.state.githubOwner &&
    claim.state.githubRepo === bounty.state.githubRepo &&
    claim.state.pullNumber === bounty.state.pullNumber &&
    claim.state.amountKelvin === bounty.state.amountKelvin &&
    claim.state.deadlineUnixMs === bounty.state.deadlineUnixMs &&
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
