"use client";

import type { DecodedMergePayWorkflow } from "@mergepay/rialo-client";
import { Check, CircleAlert, KeyRound, LoaderCircle } from "lucide-react";
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
  onConfirmed: (result: AcceptClaimResult) => void;
}

export function AcceptClaimAction({
  workflow,
  workflowSlug,
  claimWorkflowHint,
  onConfirmed,
}: Readonly<AcceptClaimActionProps>) {
  const wallet = useWallet();
  const network = useNetwork();
  const acceptClaim = useAcceptClaim();
  const [claimWorkflow, setClaimWorkflow] = useState(claimWorkflowHint ?? "");
  const [formError, setFormError] = useState<Error | null>(null);
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
    if (!claimWorkflow.trim()) {
      setFormError(new Error("Paste the contributor claim record address first."));
      return;
    }
    try {
      const result = await acceptClaim.execute({
        workflowSlug,
        claimWorkflow: claimWorkflow.trim(),
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
    "Read the contributor claim record, confirm its terms match this bounty, then lock the payout wallet.";
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
  }

  const unavailable =
    !walletReady ||
    !isSponsor ||
    !claimWorkflow.trim() ||
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
        <label className="form-field">
          <span>Contributor claim record</span>
          <input
            autoComplete="off"
            disabled={busy || acceptClaim.status === "success"}
            onChange={(event) => {
              setClaimWorkflow(event.target.value);
              setFormError(null);
            }}
            placeholder="Paste the claim workflow address"
            spellCheck={false}
            value={claimWorkflow}
          />
          <small>The address is created by the contributor wallet and can be shared from the claim confirmation.</small>
        </label>
        {acceptClaim.result?.beneficiary ? <div className="workflow-claim__approved"><span>Locked beneficiary</span><CopyValue value={acceptClaim.result.beneficiary} /></div> : null}
        <button className="button" disabled={unavailable} onClick={approveClaim} type="button">
          {busy ? <LoaderCircle aria-hidden="true" className="ui-icon ui-icon--spin" size={15} /> : acceptClaim.status === "success" ? <Check aria-hidden="true" size={15} /> : <KeyRound aria-hidden="true" size={15} />}
          {buttonLabel}
        </button>
      </div>
    </section>
  );
}
