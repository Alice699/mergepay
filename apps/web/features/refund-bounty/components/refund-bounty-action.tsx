"use client";

import type { DecodedMergePayWorkflow } from "@mergepay/rialo-client";
import { Check, CircleAlert, HandCoins, LoaderCircle } from "lucide-react";
import { useRefundBounty } from "@/features/refund-bounty/use-refund-bounty";
import { useNetwork } from "@/hooks/use-network";
import { useWallet } from "@/hooks/use-wallet";
import { describeRialoError } from "@/lib/errors";
import { formatRlo } from "@/lib/format";

interface RefundBountyActionProps {
  workflow: DecodedMergePayWorkflow;
  workflowSlug: string;
  onConfirmed: (signature: string) => void;
}

export function RefundBountyAction({
  workflow,
  workflowSlug,
  onConfirmed,
}: Readonly<RefundBountyActionProps>) {
  const wallet = useWallet();
  const network = useNetwork();
  const refundBounty = useRefundBounty();
  const phase = refundBounty.transaction.phase;
  const isSponsor = wallet.address === workflow.state.sponsor;
  const busy = refundBounty.status === "pending";
  const unavailable =
    wallet.status !== "connected" ||
    !wallet.address ||
    !isSponsor ||
    !network.isExpectedNetwork ||
    network.rpcStatus !== "available" ||
    busy ||
    refundBounty.status === "success";

  let statusTone = "idle";
  let statusTitle = "Refund available";
  let statusCopy =
    "The deadline passed without payout. The sponsor can recover the exact escrow amount.";
  let buttonLabel = "Refund escrow";

  if (wallet.status !== "connected" || !wallet.address) {
    statusTitle = "Sponsor wallet required";
    statusCopy = "Unlock or connect the wallet that created this workflow.";
  } else if (!isSponsor) {
    statusTitle = "Wrong wallet";
    statusCopy = "Switch to the sponsor address shown in this workflow record.";
  } else if (!network.isExpectedNetwork) {
    statusTitle = "Wrong network";
    statusCopy = "Switch the sponsor wallet to Rialo DevNet.";
  } else if (network.rpcStatus === "checking") {
    statusTitle = "Checking Rialo RPC";
    statusCopy = "Refund becomes available when the DevNet connection is ready.";
  } else if (network.rpcStatus === "unavailable") {
    statusTone = "error";
    statusTitle = "RPC unavailable";
    statusCopy = "Rialo DevNet cannot be reached right now.";
  } else if (busy) {
    statusTone = "pending";
    if (phase === "reviewing") {
      statusTitle = "Review refund";
      statusCopy = "Confirm the workflow account and amount returning to the sponsor.";
      buttonLabel = "Awaiting review";
    } else if (phase === "signing") {
      statusTitle = "Awaiting signature";
      statusCopy = "Approve the refund transaction in the sponsor wallet.";
      buttonLabel = "Awaiting signature";
    } else {
      statusTitle = "Returning escrow";
      statusCopy = "The signed refund is being confirmed by Rialo.";
      buttonLabel = "Confirming";
    }
  } else if (refundBounty.status === "error") {
    statusTone = "error";
    statusTitle = "Refund failed";
    statusCopy = describeRialoError(refundBounty.error);
    buttonLabel = "Try refund again";
  } else if (refundBounty.status === "success") {
    statusTone = "success";
    statusTitle = "Refund transaction confirmed";
    statusCopy = "Rialo executed the refund. The updated workflow state is being decoded.";
    buttonLabel = "Refund confirmed";
  }

  async function refund() {
    try {
      const result = await refundBounty.execute({
        workflowSlug,
        sponsor: workflow.state.sponsor,
      });
      onConfirmed(result.signature);
    } catch {
      // The action status keeps the exact preflight or transaction failure visible.
    }
  }

  return (
    <section className={"workflow-refund workflow-refund--" + statusTone}>
      <div className="workflow-refund__copy">
        <p className="panel-label">EXPIRED / SPONSOR ONLY</p>
        <h3>Recover escrow</h3>
        <p>{statusCopy}</p>
      </div>
      <div className="workflow-refund__amount">
        <span>Refund amount</span>
        <strong>{formatRlo(workflow.state.amountKelvin)} RLO</strong>
        <small>Returned from the expired escrow</small>
      </div>
      <div className="workflow-refund__submit">
        <span aria-live="polite" data-tone={statusTone}>
          {statusTone === "success" ? <Check aria-hidden="true" size={13} /> : statusTone === "error" ? <CircleAlert aria-hidden="true" size={13} /> : null}
          {statusTitle}
        </span>
        <button className="button" disabled={unavailable} onClick={refund} type="button">
          {busy ? <LoaderCircle aria-hidden="true" className="ui-icon ui-icon--spin" size={15} /> : refundBounty.status === "success" ? <Check aria-hidden="true" className="ui-icon" size={15} /> : <HandCoins aria-hidden="true" className="ui-icon" size={15} />}
          {buttonLabel}
        </button>
      </div>
    </section>
  );
}
