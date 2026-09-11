"use client";

import type { DecodedMergePayWorkflow } from "@mergepay/rialo-client";
import { Check, CircleAlert, KeyRound, LoaderCircle, RadioTower, RefreshCw } from "lucide-react";
import { useState } from "react";
import { CopyValue } from "@/components/ui/copy-value";
import { useNetwork } from "@/hooks/use-network";
import { useWallet } from "@/hooks/use-wallet";
import { describeRialoError } from "@/lib/errors";
import {
  type AcceptClaimResult,
  useAcceptClaim,
} from "@/features/claim-bounty/use-accept-claim";

interface AcceptClaimActionProps {
  workflow: DecodedMergePayWorkflow;
  workflowSlug: string;
  claimWorkflowHint: string | null;
  claimDiscoveryError: Error | null;
  claimDiscoveryStatus: ClaimDiscoveryStatus;
  onConfirmed: (result: AcceptClaimResult) => void;
  onRetryClaimDiscovery: () => void;
}

export type ClaimDiscoveryStatus =
  | "idle"
  | "searching"
  | "waiting"
  | "found"
  | "error";

export function AcceptClaimAction({
  workflow,
  workflowSlug,
  claimWorkflowHint,
  claimDiscoveryError,
  claimDiscoveryStatus,
  onConfirmed,
  onRetryClaimDiscovery,
}: Readonly<AcceptClaimActionProps>) {
  const wallet = useWallet();
  const network = useNetwork();
  const acceptClaim = useAcceptClaim();
  const [formError, setFormError] = useState<Error | null>(null);
  const claimWorkflow = claimWorkflowHint?.trim() ?? "";
  const phase = acceptClaim.transaction.phase;
  const busy = acceptClaim.status === "pending";
  const isSponsor = wallet.address === workflow.state.sponsor;
  const walletReady =
    wallet.status === "connected" &&
    Boolean(wallet.address) &&
    network.isExpectedNetwork &&
    network.rpcStatus === "available";

  async function approveClaim() {
    setFormError(null);
    if (!claimWorkflow) {
      setFormError(new Error("No confirmed contributor claim has been detected yet."));
      return;
    }
    try {
      const result = await acceptClaim.execute({
        workflowSlug,
        claimWorkflow,
        bounty: workflow,
      });
      onConfirmed(result);
    } catch {
      // The action status keeps the exact preflight or transaction failure visible.
    }
  }

  let statusTone = "idle";
  let statusTitle = "Sponsor approval";
  let statusCopy =
    "MergePay watches this workflow for a matching contributor claim and fills the record automatically.";
  let buttonLabel = "Approve claim";

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
      statusTitle = "Review approval";
      statusCopy = "Confirm the contributor claim record before signing.";
      buttonLabel = "Awaiting review";
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
    buttonLabel = "Try again";
  } else if (acceptClaim.status === "success") {
    statusTone = "success";
    statusTitle = "Claim approved";
    statusCopy = `Payout is now locked to @${acceptClaim.result?.githubLogin ?? "the contributor"}. Fund the escrow to continue.`;
    buttonLabel = "Claim approved";
  } else if (!claimWorkflow && claimDiscoveryStatus === "error") {
    statusTone = "error";
    statusTitle = "Claim lookup interrupted";
    statusCopy = claimDiscoveryError
      ? describeRialoError(claimDiscoveryError)
      : "Rialo did not return claim history for this workflow.";
    buttonLabel = "Claim not detected";
  } else if (!claimWorkflow && claimDiscoveryStatus === "waiting") {
    statusTitle = "Waiting for contributor";
    statusCopy = "No matching claim is onchain yet. This page checks again automatically.";
    buttonLabel = "Waiting for claim";
  } else if (!claimWorkflow) {
    statusTone = "pending";
    statusTitle = "Finding contributor claim";
    statusCopy = "Scanning recent transactions that reference this exact workflow.";
    buttonLabel = "Finding claim";
  } else {
    statusTone = "ready";
    statusTitle = "Claim detected";
    statusCopy = "A matching onchain claim record was found and its bounty terms will be checked again before approval.";
  }

  const unavailable =
    !walletReady ||
    !isSponsor ||
    !claimWorkflow ||
    busy ||
    acceptClaim.status === "success";

  return (
    <section className={`workflow-claim workflow-claim--approval workflow-claim--${statusTone}`}>
      <div className="workflow-claim__header">
        <div className="workflow-claim__copy">
          <p className="panel-label">NEXT ACTION / SPONSOR ONLY</p>
          <h3>Approve contributor</h3>
          <p>{statusCopy}</p>
        </div>
        <span className="workflow-claim__status" aria-live="polite" data-tone={statusTone}>
          {statusTone === "success" ? (
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
      <div className="workflow-claim__approval-body">
        <div className="workflow-claim__approval-entry">
          <div
            className="workflow-claim__approval-detection"
            data-status={claimWorkflow ? "found" : claimDiscoveryStatus}
          >
            <span className="workflow-claim__approval-detection-icon" aria-hidden="true">
              {claimWorkflow ? (
                <Check size={16} strokeWidth={2} />
              ) : claimDiscoveryStatus === "error" ? (
                <CircleAlert size={16} strokeWidth={1.8} />
              ) : claimDiscoveryStatus === "searching" || claimDiscoveryStatus === "idle" ? (
                <LoaderCircle className="ui-icon ui-icon--spin" size={16} strokeWidth={1.8} />
              ) : (
                <RadioTower size={16} strokeWidth={1.8} />
              )}
            </span>
            <div>
              <span>CONTRIBUTOR CLAIM RECORD</span>
              {claimWorkflow ? (
                <CopyValue value={claimWorkflow} />
              ) : (
                <strong>{claimDiscoveryStatus === "error" ? "Lookup unavailable" : claimDiscoveryStatus === "waiting" ? "Watching Rialo DevNet" : "Scanning workflow history"}</strong>
              )}
              <small>{claimWorkflow ? "Matched to this bounty and ready for sponsor review." : "The address appears here as soon as the contributor transaction is confirmed."}</small>
            </div>
            {!claimWorkflow && claimDiscoveryStatus !== "searching" ? (
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
          <button className="button workflow-claim__approval-submit" disabled={unavailable} onClick={approveClaim} type="button">
            {busy ? <LoaderCircle aria-hidden="true" className="ui-icon ui-icon--spin" size={15} /> : acceptClaim.status === "success" ? <Check aria-hidden="true" size={15} /> : <KeyRound aria-hidden="true" size={15} />}
            {buttonLabel}
          </button>
        </div>
        <p className="workflow-claim__approval-help">Discovery reads transactions that reference this workflow, then approval independently validates the claim owner, target, contributor wallet, GitHub identity, amount, and deadline.</p>
        {acceptClaim.result?.beneficiary ? <div className="workflow-claim__approved"><span>Locked beneficiary</span><CopyValue value={acceptClaim.result.beneficiary} /></div> : null}
      </div>
    </section>
  );
}
