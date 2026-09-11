"use client";

import {
  MERGEPAY_UNASSIGNED_BENEFICIARY,
  type DecodedMergePayWorkflow,
  type MergePayClaimRequest,
} from "@mergepay/rialo-client";
import {
  BadgeCheck,
  Check,
  CircleAlert,
  GitPullRequest,
  KeyRound,
  LoaderCircle,
  RadioTower,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { useState } from "react";
import { CopyValue } from "@/components/ui/copy-value";
import { TransactionProof } from "@/components/ui/transaction-proof";
import {
  claimMatchesBountyTerms,
  hasVerifiedGitHubAuthor,
} from "@/features/claim-bounty/claim-review";
import {
  type AcceptClaimResult,
  useAcceptClaim,
} from "@/features/claim-bounty/use-accept-claim";
import { useGitHubClaimReview } from "@/hooks/use-github-claim-review";
import { useNetwork } from "@/hooks/use-network";
import { useWallet } from "@/hooks/use-wallet";
import { describeRialoError } from "@/lib/errors";
import { formatDeadline, formatRlo, shortenAddress } from "@/lib/format";

interface AcceptClaimActionProps {
  workflow: DecodedMergePayWorkflow;
  workflowSlug: string;
  claimWorkflowHint: string | null;
  claimRequests: readonly MergePayClaimRequest[];
  claimDiscoveryError: Error | null;
  claimDiscoveryStatus: ClaimDiscoveryStatus;
  onConfirmed: (result: AcceptClaimResult) => void;
  onRetryClaimDiscovery: () => void;
  onSelectClaim: (claimAddress: string) => void;
}

export type ClaimDiscoveryStatus =
  | "idle"
  | "searching"
  | "waiting"
  | "found"
  | "error";

function fallbackPullUrl(claim: DecodedMergePayWorkflow): string {
  return `https://github.com/${encodeURIComponent(claim.state.githubOwner)}/${encodeURIComponent(claim.state.githubRepo)}/pull/${claim.state.pullNumber.toString()}`;
}

export function AcceptClaimAction({
  workflow,
  workflowSlug,
  claimWorkflowHint,
  claimRequests,
  claimDiscoveryError,
  claimDiscoveryStatus,
  onConfirmed,
  onRetryClaimDiscovery,
  onSelectClaim,
}: Readonly<AcceptClaimActionProps>) {
  const wallet = useWallet();
  const network = useNetwork();
  const acceptClaim = useAcceptClaim();
  const [formError, setFormError] = useState<Error | null>(null);
  const selectedRequest =
    claimRequests.find(
      (request) => request.claim.address === claimWorkflowHint,
    ) ?? null;
  const selectedClaim = selectedRequest?.claim ?? null;
  const githubReview = useGitHubClaimReview(
    selectedClaim
      ? {
          owner: selectedClaim.state.githubOwner,
          repo: selectedClaim.state.githubRepo,
          number: selectedClaim.state.pullNumber,
          claimantGithubId: selectedClaim.state.claimantGithubId,
          claimantGithubLogin: selectedClaim.state.claimantGithub,
        }
      : null,
  );
  const phase = acceptClaim.transaction.phase;
  const busy = acceptClaim.status === "pending";
  const isSponsor = wallet.address === workflow.state.sponsor;
  const walletReady =
    wallet.status === "connected" &&
    Boolean(wallet.address) &&
    network.isExpectedNetwork &&
    network.rpcStatus === "available";
  const termsMatch = Boolean(
    selectedClaim && claimMatchesBountyTerms(selectedClaim, workflow),
  );
  const payoutWalletCaptured = Boolean(
    selectedClaim &&
      selectedClaim.state.beneficiary !== MERGEPAY_UNASSIGNED_BENEFICIARY,
  );
  const authorVerified = Boolean(
    selectedClaim &&
      githubReview.status === "success" &&
      hasVerifiedGitHubAuthor(githubReview.review, selectedClaim),
  );
  const authorMismatch = Boolean(
    selectedClaim &&
      githubReview.status === "success" &&
      !hasVerifiedGitHubAuthor(githubReview.review, selectedClaim),
  );
  const liveAuthor =
    githubReview.status === "success" ? githubReview.review.author : null;
  const githubTarget =
    githubReview.status === "success" ? githubReview.review.target : null;
  const pullUrl = selectedClaim
    ? githubTarget?.htmlUrl ?? fallbackPullUrl(selectedClaim)
    : null;
  const githubLoginChanged = Boolean(
    authorVerified &&
      githubReview.status === "success" &&
      !githubReview.review.verification.recordedLoginMatches,
  );

  function handleSelectClaim(claimAddress: string) {
    setFormError(null);
    acceptClaim.reset();
    onSelectClaim(claimAddress);
  }

  async function approveClaim() {
    setFormError(null);
    if (!selectedRequest || !selectedClaim) {
      setFormError(
        new Error("Select one confirmed contributor claim before approval."),
      );
      return;
    }
    if (!termsMatch) {
      setFormError(
        new Error("The selected claim no longer matches this bounty."),
      );
      return;
    }
    if (!authorVerified) {
      setFormError(
        new Error(
          "GitHub must confirm that the recorded contributor authored this pull request before approval.",
        ),
      );
      return;
    }
    try {
      const result = await acceptClaim.execute({
        workflowSlug,
        claimWorkflow: selectedClaim.address,
        bounty: workflow,
      });
      onConfirmed(result);
    } catch {
      // The action status keeps the exact preflight or transaction failure visible.
    }
  }

  let statusTone = "idle";
  let statusTitle = "Sponsor review";
  let statusCopy =
    "Review the detected contributor, payout destination, bounty terms, and public GitHub proof before locking the beneficiary.";
  let buttonLabel = "Approve contributor";

  if (wallet.status !== "connected" || !wallet.address) {
    statusTitle = "Sponsor wallet required";
    statusCopy = "Connect the wallet that created this bounty.";
  } else if (!isSponsor) {
    statusTitle = "Wrong wallet";
    statusCopy = "Only the sponsor can approve a contributor claim.";
  } else if (!network.isExpectedNetwork) {
    statusTitle = "Wrong network";
    statusCopy = "Switch the sponsor wallet to Rialo DevNet.";
  } else if (network.rpcStatus === "checking") {
    statusTitle = "Checking Rialo RPC";
    statusCopy = "Claim approval unlocks when the DevNet connection is ready.";
  } else if (network.rpcStatus === "unavailable") {
    statusTone = "error";
    statusTitle = "RPC unavailable";
    statusCopy = "Rialo DevNet cannot be reached right now.";
  } else if (formError) {
    statusTone = "error";
    statusTitle = "Approval not ready";
    statusCopy = formError.message;
  } else if (busy) {
    statusTone = "pending";
    if (phase === "reviewing") {
      statusTitle = "Final preflight";
      statusCopy = "The claim account and GitHub author are being checked again.";
      buttonLabel = "Reviewing proof";
    } else if (phase === "signing") {
      statusTitle = "Awaiting signature";
      statusCopy = "Approve the beneficiary lock in the sponsor wallet.";
      buttonLabel = "Awaiting signature";
    } else {
      statusTitle = "Submitting approval";
      statusCopy = "The beneficiary lock is being confirmed by Rialo.";
      buttonLabel = "Confirming";
    }
  } else if (acceptClaim.status === "error") {
    statusTone = "error";
    statusTitle = "Approval failed";
    statusCopy = describeRialoError(acceptClaim.error);
    buttonLabel = "Try approval again";
  } else if (acceptClaim.status === "success") {
    statusTone = "success";
    statusTitle = "Claim approved";
    statusCopy = `Payout is now locked to @${acceptClaim.result?.githubLogin ?? "the contributor"}. Fund the escrow to continue.`;
    buttonLabel = "Claim approved";
  } else if (claimRequests.length > 1 && !selectedRequest) {
    statusTone = "pending";
    statusTitle = "Selection required";
    statusCopy = `${claimRequests.length} matching claims were found. Choose the contributor you intend to approve.`;
    buttonLabel = "Choose a claim";
  } else if (!selectedRequest && claimDiscoveryStatus === "error") {
    statusTone = "error";
    statusTitle = "Claim lookup interrupted";
    statusCopy = claimDiscoveryError
      ? describeRialoError(claimDiscoveryError)
      : "Rialo did not return claim history for this workflow.";
    buttonLabel = "Claim not detected";
  } else if (!selectedRequest && claimDiscoveryStatus === "waiting") {
    statusTitle = "Waiting for contributor";
    statusCopy =
      "No matching claim is onchain yet. This page checks again automatically.";
    buttonLabel = "Waiting for claim";
  } else if (!selectedRequest) {
    statusTone = "pending";
    statusTitle = "Finding contributor claim";
    statusCopy = "Scanning transactions that reference this exact workflow.";
    buttonLabel = "Finding claim";
  } else if (!termsMatch || !payoutWalletCaptured) {
    statusTone = "error";
    statusTitle = "Claim terms mismatch";
    statusCopy =
      "The selected record does not reproduce the immutable bounty terms, so approval is blocked.";
  } else if (
    githubReview.status === "idle" ||
    githubReview.status === "loading"
  ) {
    statusTone = "pending";
    statusTitle = "Verifying PR author";
    statusCopy =
      "Reading the public pull request and comparing its stable GitHub user ID with the onchain claim.";
    buttonLabel = "Checking GitHub";
  } else if (githubReview.status === "error") {
    statusTone = "error";
    statusTitle = "GitHub check unavailable";
    statusCopy = githubReview.error.message;
    buttonLabel = "Verification required";
  } else if (authorMismatch) {
    statusTone = "error";
    statusTitle = "PR author mismatch";
    statusCopy = `GitHub identifies @${liveAuthor?.login ?? "another account"} as the PR author. This claim cannot be approved.`;
    buttonLabel = "Approval blocked";
  } else if (authorVerified) {
    statusTone = "ready";
    statusTitle = "Review passed";
    statusCopy = githubLoginChanged
      ? `GitHub user ID matches. The account is now @${liveAuthor?.login}; the claim recorded its previous login.`
      : "The claim terms and payout wallet match, and GitHub confirms the user ID recorded in the claim authored this PR.";
  }

  const unavailable =
    !walletReady ||
    !isSponsor ||
    !selectedRequest ||
    !termsMatch ||
    !authorVerified ||
    busy ||
    acceptClaim.status === "success";
  const githubCheckTone = authorVerified
    ? "success"
    : authorMismatch || githubReview.status === "error"
      ? "error"
      : "pending";
  const discoveryCardStatus =
    claimDiscoveryStatus === "found" && !selectedRequest
      ? "multiple"
      : claimDiscoveryStatus;

  return (
    <section
      className={`workflow-claim workflow-claim--approval workflow-claim--${statusTone}`}
    >
      <div className="workflow-claim__header">
        <div className="workflow-claim__copy">
          <p className="panel-label">NEXT ACTION / SPONSOR ONLY</p>
          <h3>Review contributor claim</h3>
          <p>{statusCopy}</p>
        </div>
        <span
          className="workflow-claim__status"
          aria-live="polite"
          data-tone={statusTone}
        >
          {statusTone === "success" || statusTone === "ready" ? (
            <Check aria-hidden="true" size={13} />
          ) : statusTone === "error" ? (
            <CircleAlert aria-hidden="true" size={13} />
          ) : statusTone === "pending" ? (
            <LoaderCircle
              aria-hidden="true"
              className="ui-icon ui-icon--spin"
              size={13}
            />
          ) : (
            <span
              aria-hidden="true"
              className="workflow-claim__status-dot"
            />
          )}
          {statusTitle}
        </span>
      </div>

      <div className="workflow-claim__approval-body">
        {claimRequests.length > 1 ? (
          <section
            aria-labelledby="claim-candidates-title"
            className="workflow-claim__candidates"
          >
            <div className="workflow-claim__section-heading">
              <div>
                <span>01 / CLAIM CANDIDATES</span>
                <h4 id="claim-candidates-title">Choose one onchain claim</h4>
              </div>
              <small>{claimRequests.length} matching records</small>
            </div>
            <div
              aria-label="Contributor claims"
              className="workflow-claim__candidate-list"
              role="radiogroup"
            >
              {claimRequests.map((request, index) => {
                const selected =
                  request.claim.address === selectedClaim?.address;
                return (
                  <button
                    aria-checked={selected}
                    className="workflow-claim__candidate"
                    data-selected={selected}
                    disabled={busy || acceptClaim.status === "success"}
                    key={request.claim.address}
                    onClick={() => handleSelectClaim(request.claim.address)}
                    role="radio"
                    type="button"
                  >
                    <span className="workflow-claim__candidate-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="workflow-claim__candidate-copy">
                      <strong>@{request.claim.state.claimantGithub}</strong>
                      <small>
                        {shortenAddress(request.claim.state.beneficiary, 6)}
                      </small>
                    </span>
                    <span className="workflow-claim__candidate-state">
                      {selected ? (
                        <>
                          <Check aria-hidden="true" size={12} /> Selected
                        </>
                      ) : (
                        "Review"
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {!selectedRequest || !selectedClaim ? (
          <div
            className="workflow-claim__approval-detection"
            data-status={discoveryCardStatus}
          >
            <span
              className="workflow-claim__approval-detection-icon"
              aria-hidden="true"
            >
              {claimDiscoveryStatus === "error" ? (
                <CircleAlert size={16} strokeWidth={1.8} />
              ) : claimDiscoveryStatus === "searching" ||
                claimDiscoveryStatus === "idle" ? (
                <LoaderCircle
                  className="ui-icon ui-icon--spin"
                  size={16}
                  strokeWidth={1.8}
                />
              ) : (
                <RadioTower size={16} strokeWidth={1.8} />
              )}
            </span>
            <div>
              <span>CONTRIBUTOR CLAIM DISCOVERY</span>
              <strong>
                {claimRequests.length > 1
                  ? "Select a claim above"
                  : claimDiscoveryStatus === "error"
                    ? "Lookup unavailable"
                    : claimDiscoveryStatus === "waiting"
                      ? "Watching Rialo DevNet"
                      : "Scanning workflow history"}
              </strong>
              <small>
                {claimRequests.length > 1
                  ? "MergePay never picks silently when more than one valid claim exists."
                  : "A confirmed matching record appears here automatically."}
              </small>
            </div>
            {claimRequests.length === 0 &&
            claimDiscoveryStatus !== "searching" ? (
              <button
                className="button button--quiet workflow-claim__approval-retry"
                disabled={!walletReady || !isSponsor || busy}
                onClick={onRetryClaimDiscovery}
                type="button"
              >
                <RefreshCw aria-hidden="true" size={13} strokeWidth={1.8} />
                Check now
              </button>
            ) : null}
          </div>
        ) : (
          <section
            className="workflow-claim__review"
            data-verdict={
              authorVerified
                ? "verified"
                : authorMismatch || githubReview.status === "error"
                  ? "blocked"
                  : "checking"
            }
          >
            <div className="workflow-claim__review-identity">
              <span className="workflow-claim__review-avatar" aria-hidden="true">
                {selectedClaim.state.claimantGithub.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <span>CONTRIBUTOR IDENTITY</span>
                <h4>@{selectedClaim.state.claimantGithub}</h4>
                <p>
                  Stable GitHub user ID {selectedClaim.state.claimantGithubId.toString()}
                </p>
              </div>
              <span
                className="workflow-claim__review-verdict"
                data-tone={githubCheckTone}
              >
                {authorVerified ? (
                  <BadgeCheck aria-hidden="true" size={14} />
                ) : authorMismatch || githubReview.status === "error" ? (
                  <CircleAlert aria-hidden="true" size={14} />
                ) : (
                  <LoaderCircle
                    aria-hidden="true"
                    className="ui-icon ui-icon--spin"
                    size={14}
                  />
                )}
                {authorVerified
                  ? "Author verified"
                  : authorMismatch
                    ? "Author mismatch"
                    : githubReview.status === "error"
                      ? "Check unavailable"
                      : "Checking GitHub"}
              </span>
            </div>

            <div className="workflow-claim__review-grid">
              <div className="workflow-claim__review-field workflow-claim__review-field--target">
                <span>PUBLIC PULL REQUEST</span>
                <a
                  href={pullUrl ?? undefined}
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  <GitPullRequest aria-hidden="true" size={15} />
                  <strong>
                    {selectedClaim.state.githubOwner}/
                    {selectedClaim.state.githubRepo}
                    <span> #{selectedClaim.state.pullNumber.toString()}</span>
                  </strong>
                </a>
                <small>
                  {githubTarget?.title ??
                    "Reading the live pull-request record from GitHub"}
                </small>
              </div>
              <div className="workflow-claim__review-field">
                <span>BOUNTY TERMS</span>
                <strong>{formatRlo(selectedClaim.state.amountKelvin)} RLO</strong>
                <small suppressHydrationWarning>
                  Deadline {formatDeadline(selectedClaim.state.deadlineUnixMs)}
                </small>
              </div>
              <div className="workflow-claim__review-field">
                <span>PAYOUT WALLET</span>
                <div className="workflow-claim__review-value">
                  <WalletCards aria-hidden="true" size={14} />
                  <CopyValue value={selectedClaim.state.beneficiary} />
                </div>
                <small>This address becomes the locked beneficiary.</small>
              </div>
              <div className="workflow-claim__review-field">
                <span>CLAIM RECORD</span>
                <CopyValue value={selectedClaim.address} />
                <small>Decoded from the active MergePay program.</small>
              </div>
              <div className="workflow-claim__review-field workflow-claim__review-field--transaction">
                <span>CLAIM TRANSACTION</span>
                <TransactionProof signature={selectedRequest.signature} />
                <small>
                  Open the exact request_claim transaction in Rialo Scan.
                </small>
              </div>
            </div>

            <ul
              className="workflow-claim__review-checks"
              aria-label="Approval checks"
            >
              <li data-tone={termsMatch ? "success" : "error"}>
                {termsMatch ? (
                  <Check aria-hidden="true" size={13} />
                ) : (
                  <CircleAlert aria-hidden="true" size={13} />
                )}
                <span>
                  <strong>Bounty terms</strong>
                  <small>Target, amount, deadline, and sponsor match</small>
                </span>
              </li>
              <li data-tone={payoutWalletCaptured ? "success" : "error"}>
                {payoutWalletCaptured ? (
                  <Check aria-hidden="true" size={13} />
                ) : (
                  <CircleAlert aria-hidden="true" size={13} />
                )}
                <span>
                  <strong>Payout destination</strong>
                  <small>Contributor wallet is present onchain</small>
                </span>
              </li>
              <li data-tone={githubCheckTone}>
                {authorVerified ? (
                  <Check aria-hidden="true" size={13} />
                ) : authorMismatch || githubReview.status === "error" ? (
                  <CircleAlert aria-hidden="true" size={13} />
                ) : (
                  <LoaderCircle
                    aria-hidden="true"
                    className="ui-icon ui-icon--spin"
                    size={13}
                  />
                )}
                <span>
                  <strong>GitHub PR author</strong>
                  <small>
                    {authorVerified
                      ? `Recorded user ID ${selectedClaim.state.claimantGithubId.toString()} matches @${liveAuthor?.login ?? selectedClaim.state.claimantGithub}`
                      : authorMismatch
                        ? `Live author is @${liveAuthor?.login ?? "different"}`
                        : githubReview.status === "error"
                          ? "Public verification could not complete"
                          : "Checking the live public PR"}
                  </small>
                </span>
              </li>
              <li data-tone={isSponsor ? "success" : "error"}>
                {isSponsor ? (
                  <Check aria-hidden="true" size={13} />
                ) : (
                  <CircleAlert aria-hidden="true" size={13} />
                )}
                <span>
                  <strong>Sponsor authority</strong>
                  <small>Connected signer created this bounty</small>
                </span>
              </li>
            </ul>

            {githubReview.status === "error" || authorMismatch ? (
              <button
                className="workflow-claim__review-retry"
                disabled={busy}
                onClick={githubReview.retry}
                type="button"
              >
                <RefreshCw aria-hidden="true" size={13} />
                Recheck GitHub
              </button>
            ) : null}
          </section>
        )}

        <div
          className="workflow-claim__approval-decision"
          data-ready={!unavailable}
        >
          <div className="workflow-claim__approval-decision-copy">
            <span className="workflow-claim__approval-decision-icon">
              {authorVerified ? (
                <BadgeCheck aria-hidden="true" size={17} />
              ) : (
                <KeyRound aria-hidden="true" size={17} />
              )}
            </span>
            <div>
              <strong>
                {authorVerified
                  ? "Ready to lock this payout wallet"
                  : "Approval remains locked until every check passes"}
              </strong>
              <small>
                The final preflight repeats the onchain claim and GitHub author
                checks before the wallet opens.
              </small>
            </div>
          </div>
          <button
            className="button workflow-claim__approval-submit"
            disabled={unavailable}
            onClick={approveClaim}
            type="button"
          >
            {busy ? (
              <LoaderCircle
                aria-hidden="true"
                className="ui-icon ui-icon--spin"
                size={15}
              />
            ) : acceptClaim.status === "success" ? (
              <Check aria-hidden="true" size={15} />
            ) : (
              <KeyRound aria-hidden="true" size={15} />
            )}
            {buttonLabel}
          </button>
        </div>

        <p className="workflow-claim__approval-help">
          GitHub verifies the identity recorded in this claim; sponsor approval
          binds the displayed payout wallet. An unavailable or mismatched
          response never enables approval, and the claim account is decoded again
          before signing.
        </p>
        {acceptClaim.result?.beneficiary ? (
          <div className="workflow-claim__approved">
            <span>Locked beneficiary</span>
            <CopyValue value={acceptClaim.result.beneficiary} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
