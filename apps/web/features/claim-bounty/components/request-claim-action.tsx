"use client";

import type { DecodedMergePayWorkflow } from "@mergepay/rialo-client";
import {
  Check,
  CircleAlert,
  Fingerprint,
  GitBranch,
  LoaderCircle,
  WalletCards,
} from "lucide-react";
import { useState } from "react";
import { CopyValue } from "@/components/ui/copy-value";
import { useGitHubIdentity } from "@/hooks/use-github-identity";
import { useGitHubPullProof } from "@/hooks/use-github-pull-proof";
import { useNetwork } from "@/hooks/use-network";
import { useWallet } from "@/hooks/use-wallet";
import { describeRialoError } from "@/lib/errors";
import { generateWorkflowSlug } from "@/lib/validation";
import {
  type RequestClaimResult,
  useRequestClaim,
} from "@/features/claim-bounty/use-request-claim";

interface RequestClaimActionProps {
  workflow: DecodedMergePayWorkflow;
  onConfirmed: (result: RequestClaimResult) => void;
}

export function RequestClaimAction({
  workflow,
  onConfirmed,
}: Readonly<RequestClaimActionProps>) {
  const wallet = useWallet();
  const network = useNetwork();
  const github = useGitHubIdentity();
  const proof = useGitHubPullProof();
  const requestClaim = useRequestClaim();
  const [claimWorkflowSlug, setClaimWorkflowSlug] = useState("");
  const [formError, setFormError] = useState<Error | null>(null);
  const phase = requestClaim.transaction.phase;
  const busy = requestClaim.status === "pending";
  const proofMatches =
    proof.status === "success" &&
    Boolean(github.identity) &&
    proof.proof.author.id === github.identity?.id;
  const isSponsor = wallet.address === workflow.state.sponsor;
  const walletReady =
    wallet.status === "connected" &&
    Boolean(wallet.address) &&
    network.isExpectedNetwork &&
    network.rpcStatus === "available";

  async function verifyAuthor() {
    setFormError(null);
    if (!github.identity) {
      setFormError(new Error("Connect the GitHub account that authored this pull request first."));
      return;
    }
    try {
      const verified = await proof.verify({
        owner: workflow.state.githubOwner,
        repo: workflow.state.githubRepo,
        number: workflow.state.pullNumber,
      });
      if (verified.author.id !== github.identity.id) {
        setFormError(new Error("The connected GitHub account did not author this pull request."));
      }
    } catch {
      // The proof hook exposes the request error below.
    }
  }

  async function submitClaim() {
    setFormError(null);
    if (!github.identity) {
      setFormError(new Error("Connect the GitHub account that authored this pull request."));
      return;
    }
    if (!proofMatches || !proof.proof) {
      setFormError(new Error("Verify the connected GitHub account against this pull request first."));
      return;
    }
    if (!walletReady) {
      setFormError(new Error("Connect a funded Rialo DevNet wallet before requesting a claim."));
      return;
    }
    if (isSponsor) {
      setFormError(new Error("The sponsor wallet cannot claim its own bounty."));
      return;
    }

    const nextSlug = claimWorkflowSlug || generateWorkflowSlug();
    setClaimWorkflowSlug(nextSlug);
    try {
      const result = await requestClaim.execute({
        workflowSlug: nextSlug,
        targetWorkflow: workflow.address,
        claimantGithub: proof.proof.author.login,
        claimantGithubId: github.identity.id,
        bounty: workflow,
      });
      onConfirmed(result);
    } catch {
      // The action status keeps the exact preflight or transaction failure visible.
    }
  }

  let statusTone = "idle";
  let statusTitle = "Contributor claim";
  let statusCopy =
    "Prove the public GitHub author, then sign a claim record with the wallet that should receive the bounty.";
  let buttonLabel = "Request claim";

  if (wallet.status !== "connected" || !wallet.address) {
    statusTitle = "Contributor wallet required";
    statusCopy = "Connect the Rialo wallet that should receive this bounty.";
  } else if (isSponsor) {
    statusTone = "error";
    statusTitle = "Sponsor wallet detected";
    statusCopy = "Use a contributor wallet to request this bounty. The sponsor approves the claim separately.";
  } else if (!network.isExpectedNetwork) {
    statusTone = "error";
    statusTitle = "Wrong network";
    statusCopy = "Switch the contributor wallet to Rialo DevNet.";
  } else if (network.rpcStatus === "checking") {
    statusTone = "pending";
    statusTitle = "Checking Rialo RPC";
    statusCopy = "The claim form will unlock when the DevNet connection is ready.";
  } else if (network.rpcStatus === "unavailable") {
    statusTone = "error";
    statusTitle = "RPC unavailable";
    statusCopy = "Rialo DevNet cannot be reached right now.";
  } else if (github.status === "loading") {
    statusTone = "pending";
    statusTitle = "Checking GitHub session";
    statusCopy = "MergePay is checking whether a verified GitHub identity is connected.";
  } else if (!github.configured) {
    statusTone = "error";
    statusTitle = "GitHub sign-in unavailable";
    statusCopy = "GitHub OAuth is not configured for this deployment, so contributor claims are locked.";
  } else if (!github.identity) {
    statusTitle = "Connect GitHub";
    statusCopy = "Sign in with the GitHub account that authored this PR. A typed username is not accepted as identity proof.";
  } else if (proof.status === "loading") {
    statusTone = "pending";
    statusTitle = "Checking GitHub";
    statusCopy = "Reading the public pull request author from GitHub.";
  } else if (proof.status === "error") {
    statusTone = "error";
    statusTitle = "GitHub check failed";
    statusCopy = proof.error.message;
  } else if (formError) {
    statusTone = "error";
    statusTitle = "Claim not ready";
    statusCopy = formError.message;
  } else if (busy) {
    statusTone = "pending";
    if (phase === "reviewing") {
      statusTitle = "Review claim";
      statusCopy = "Confirm the GitHub author and recipient wallet before signing.";
      buttonLabel = "Awaiting review";
    } else if (phase === "signing") {
      statusTitle = "Awaiting signature";
      statusCopy = "Approve the contributor claim in the wallet.";
      buttonLabel = "Awaiting signature";
    } else {
      statusTitle = "Submitting claim";
      statusCopy = "The signed claim record is being confirmed by Rialo.";
      buttonLabel = "Confirming";
    }
  } else if (requestClaim.status === "error") {
    statusTone = "error";
    statusTitle = "Claim failed";
    statusCopy = describeRialoError(requestClaim.error);
    buttonLabel = "Try again";
  } else if (requestClaim.status === "success") {
    statusTone = "success";
    statusTitle = "Claim request submitted";
    statusCopy = "The sponsor page will detect this claim automatically. Keep this page open to follow the next step.";
    buttonLabel = "Claim submitted";
  } else if (proofMatches) {
    statusTone = "ready";
    statusTitle = "Ready to sign";
    statusCopy = "The public PR author matches. Sign the claim with the receiving wallet.";
  } else if (github.identity) {
    statusTitle = "PR verification required";
    statusCopy = `Verify that @${github.identity.login} authored pull request #${workflow.state.pullNumber.toString()} before signing.`;
  }

  const claimResult = requestClaim.result;
  const readyToSubmit =
    walletReady &&
    !isSponsor &&
    Boolean(github.identity) &&
    proofMatches;
  const unavailable =
    !walletReady ||
    isSponsor ||
    !github.identity ||
    !proofMatches ||
    busy ||
    requestClaim.status === "success";
  const proofMismatch =
    proof.status === "success" &&
    Boolean(github.identity) &&
    proof.proof.author.id !== github.identity?.id;
  const githubStepTone = proofMatches
    ? "success"
    : proof.status === "loading" || github.status === "loading"
      ? "pending"
      : proof.status === "error" || proofMismatch || !github.configured
        ? "error"
        : "idle";
  const githubStepLabel = proofMatches
    ? "Verified"
    : proof.status === "loading"
      ? "Checking"
      : proof.status === "error" || proofMismatch
        ? "Check failed"
        : !github.configured
          ? "Unavailable"
        : github.identity
          ? "Verify PR"
          : "Required";
  const walletConnected = wallet.status === "connected" && Boolean(wallet.address);
  const walletStepTone = !walletConnected
    ? "idle"
    : isSponsor || !network.isExpectedNetwork || network.rpcStatus === "unavailable"
      ? "error"
      : network.rpcStatus === "checking"
        ? "pending"
        : walletReady
          ? "success"
          : "idle";
  const walletStepLabel = !walletConnected
    ? "Required"
    : isSponsor
      ? "Sponsor wallet"
      : !network.isExpectedNetwork
        ? "Wrong network"
        : network.rpcStatus === "unavailable"
          ? "RPC unavailable"
          : network.rpcStatus === "checking"
            ? "Checking"
            : walletReady
              ? "Ready"
              : "Required";
  const walletHelp = isSponsor
    ? "Use a different contributor wallet. The sponsor wallet cannot receive its own bounty."
    : walletReady
      ? "This exact address is locked as the payout recipient after sponsor approval."
      : "Connect a funded Rialo DevNet wallet to receive the bounty payout.";
  const submitStepTone = requestClaim.status === "success"
    ? "success"
    : requestClaim.status === "error"
      ? "error"
      : busy
        ? "pending"
        : readyToSubmit
          ? "ready"
          : "idle";
  const submitStepLabel = requestClaim.status === "success"
    ? "Submitted"
    : requestClaim.status === "error"
      ? "Retry available"
      : busy
        ? "In progress"
        : readyToSubmit
          ? "Ready"
          : "Locked";
  const submitHelp = requestClaim.status === "success"
    ? "No handoff is required. MergePay is watching the bounty for sponsor approval."
    : requestClaim.status === "error"
      ? "Review the error above, then retry with the same verified identity and wallet."
      : busy
        ? "Keep this page open while Rialo confirms the signed claim record."
    : readyToSubmit
      ? "Your wallet creates and signs a separate onchain claim record."
      : "Complete GitHub verification and connect an eligible wallet to unlock this step.";

  return (
    <section className={`workflow-claim workflow-claim--${statusTone}`}>
      <div className="workflow-claim__header">
        <div className="workflow-claim__copy">
          <p className="panel-label">NEXT ACTION / CONTRIBUTOR</p>
          <h3>Claim this bounty</h3>
          <p>{statusCopy}</p>
        </div>
        <span className="workflow-claim__status" aria-live="polite" data-tone={statusTone}>
          {statusTone === "success" || statusTone === "ready" ? (
            <Check aria-hidden="true" size={13} />
          ) : statusTone === "error" ? (
            <CircleAlert aria-hidden="true" size={13} />
          ) : statusTone === "pending" ? (
            <LoaderCircle aria-hidden="true" className="ui-icon ui-icon--spin" size={13} />
          ) : (
            <span aria-hidden="true" className="workflow-claim__status-dot" />
          )}
          {statusTitle}
        </span>
      </div>

      <div className="workflow-claim__body">
        <div className="workflow-claim__proof">
          <div className="workflow-claim__step-heading">
            <div className="workflow-claim__step-title">
              <span aria-hidden="true" className="workflow-claim__step-index">01</span>
              <div>
                <span className="panel-label">GitHub identity</span>
                <small>Prove pull request authorship</small>
              </div>
            </div>
            <span className="workflow-claim__step-state" data-tone={githubStepTone}>
              {githubStepTone === "success" ? <Check aria-hidden="true" size={12} /> : null}
              {githubStepLabel}
            </span>
          </div>

          <div className="workflow-claim__identity">
            <div className="workflow-claim__identity-mark"><GitBranch aria-hidden="true" size={16} /></div>
            <div>
              <strong>{github.identity ? `@${github.identity.login}` : "Not connected"}</strong>
              <small>{github.identity ? `GitHub user ID ${github.identity.id}` : "OAuth is required to claim a bounty."}</small>
            </div>
            {github.identity ? (
              <button className="button button--quiet" disabled={busy || requestClaim.status === "success"} onClick={() => void github.disconnect()} type="button">
                Disconnect
              </button>
            ) : (
              <button className="button button--quiet" disabled={!github.configured || github.status === "loading" || busy || requestClaim.status === "success"} onClick={() => github.connect()} type="button">
                <Fingerprint aria-hidden="true" size={14} />
                Connect GitHub
              </button>
            )}
          </div>
          <div className="workflow-claim__proof-row">
            <small id="github-proof-hint">MergePay checks the exact PR author against your authenticated GitHub user ID. No username entry and no GitHub write access.</small>
            <button className="button button--quiet" disabled={!github.identity || busy || proof.status === "loading" || requestClaim.status === "success"} onClick={() => void verifyAuthor()} type="button">
              {proof.status === "loading" ? <LoaderCircle aria-hidden="true" className="ui-icon ui-icon--spin" size={14} /> : <Fingerprint aria-hidden="true" size={14} />}
              Verify PR
            </button>
          </div>

          {proofMatches && proof.proof ? (
            <div className="workflow-claim__verified">
              <Check aria-hidden="true" size={15} />
              <div><strong>@{proof.proof.author.login} identity matched</strong><span>{proof.proof.title}</span></div>
              <a href={proof.proof.htmlUrl} rel="noreferrer" target="_blank">View PR</a>
            </div>
          ) : null}
        </div>

        <div className="workflow-claim__wallet">
          <div className="workflow-claim__step-heading">
            <div className="workflow-claim__step-title">
              <span aria-hidden="true" className="workflow-claim__step-index">02</span>
              <div>
                <span className="panel-label">Payout wallet</span>
                <small>Choose the receiving address</small>
              </div>
            </div>
            <span className="workflow-claim__step-state" data-tone={walletStepTone}>
              {walletStepTone === "success" ? <Check aria-hidden="true" size={12} /> : null}
              {walletStepLabel}
            </span>
          </div>
          <div className="workflow-claim__wallet-account">
            <div className="workflow-claim__wallet-mark">
              <WalletCards aria-hidden="true" size={17} />
            </div>
            <div>
              <span className="panel-label">Receiving address</span>
              <p>{wallet.address ? <CopyValue value={wallet.address} /> : "Connect wallet to continue"}</p>
            </div>
          </div>
          <p className="workflow-claim__wallet-note" data-tone={walletStepTone}>{walletHelp}</p>
        </div>

        <div className="workflow-claim__submit" data-ready={readyToSubmit}>
          <div className="workflow-claim__submit-copy">
            <span aria-hidden="true" className="workflow-claim__step-index">03</span>
            <div>
              <div className="workflow-claim__submit-title">
                <span>Claim record</span>
                <span className="workflow-claim__step-state" data-tone={submitStepTone}>{submitStepLabel}</span>
              </div>
              <strong>{claimResult?.claimWorkflowAddress ?? "Generated when you sign"}</strong>
              <small id="claim-submit-hint">{submitHelp}</small>
            </div>
          </div>
          <button aria-describedby="claim-submit-hint" className="button" disabled={unavailable} onClick={submitClaim} type="button">
            {busy ? <LoaderCircle aria-hidden="true" className="ui-icon ui-icon--spin" size={15} /> : requestClaim.status === "success" ? <Check aria-hidden="true" size={15} /> : <Fingerprint aria-hidden="true" size={15} />}
            {buttonLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
