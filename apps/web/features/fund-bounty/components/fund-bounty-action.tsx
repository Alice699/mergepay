"use client";

import type { DecodedMergePayWorkflow } from "@mergepay/rialo-client";
import { Check, CircleAlert, LoaderCircle, LockKeyhole } from "lucide-react";
import { useFundBounty } from "@/features/fund-bounty/use-fund-bounty";
import { useDeadlinePassed } from "@/hooks/use-deadline-passed";
import { useNetwork } from "@/hooks/use-network";
import { useWallet } from "@/hooks/use-wallet";
import { FUND_TRANSACTION_FEE_BUFFER_KELVIN } from "@/lib/constants";
import { describeRialoError } from "@/lib/errors";
import { formatRlo } from "@/lib/format";

interface FundBountyActionProps {
  workflow: DecodedMergePayWorkflow;
  workflowSlug: string;
  onConfirmed: (signature: string) => void;
}

export function FundBountyAction({
  workflow,
  workflowSlug,
  onConfirmed,
}: Readonly<FundBountyActionProps>) {
  const wallet = useWallet();
  const network = useNetwork();
  const fundBounty = useFundBounty();
  const phase = fundBounty.transaction.phase;
  const isSponsor = wallet.address === workflow.state.sponsor;
  const deadlinePassed = useDeadlinePassed(workflow.state.deadlineUnixMs);
  const requiredBalance =
    workflow.state.amountKelvin + FUND_TRANSACTION_FEE_BUFFER_KELVIN;
  const balanceChecking =
    wallet.balance.status === "idle" || wallet.balance.status === "loading";
  const balanceUnavailable =
    wallet.balance.status === "error" || wallet.balance.kelvin === null;
  const balanceTooLow =
    wallet.balance.status === "ready" &&
    wallet.balance.kelvin !== null &&
    wallet.balance.kelvin < requiredBalance;
  const busy = fundBounty.status === "pending";
  const unavailable =
    wallet.status !== "connected" ||
    !wallet.address ||
    !isSponsor ||
    !network.isExpectedNetwork ||
    network.rpcStatus !== "available" ||
    balanceChecking ||
    balanceUnavailable ||
    balanceTooLow ||
    deadlinePassed ||
    busy ||
    fundBounty.status === "success";

  let statusTone = "idle";
  let statusTitle = "Sponsor action";
  let statusCopy =
    "One Rialo transaction will lock the exact amount and arm authenticated GitHub checks.";
  let buttonLabel = "Fund bounty";

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
    statusCopy = "Funding will unlock when the DevNet connection is ready.";
  } else if (network.rpcStatus === "unavailable") {
    statusTone = "error";
    statusTitle = "RPC unavailable";
    statusCopy = "Rialo DevNet cannot be reached right now.";
  } else if (deadlinePassed) {
    statusTone = "error";
    statusTitle = "Deadline passed";
    statusCopy = "New funding is disabled because this bounty has expired.";
  } else if (balanceChecking) {
    statusTitle = "Checking sponsor balance";
    statusCopy = "Confirming the wallet can cover the bounty and network fee.";
  } else if (balanceUnavailable) {
    statusTone = "error";
    statusTitle = "Balance unavailable";
    statusCopy = "Refresh the sponsor wallet balance before funding.";
  } else if (balanceTooLow) {
    statusTone = "error";
    statusTitle = "More DevNet RLO required";
    statusCopy =
      "The sponsor needs at least " +
      formatRlo(requiredBalance) +
      " RLO including fee headroom.";
  } else if (busy) {
    statusTone = "pending";
    if (phase === "reviewing") {
      statusTitle = "Review funding";
      statusCopy = "Verify the workflow account and committed amount.";
      buttonLabel = "Awaiting review";
    } else if (phase === "signing") {
      statusTitle = "Awaiting signature";
      statusCopy = "Approve the funding transaction in the sponsor wallet.";
      buttonLabel = "Awaiting signature";
    } else {
      statusTitle = "Funding escrow";
      statusCopy = "The signed transaction is being confirmed by Rialo.";
      buttonLabel = "Confirming";
    }
  } else if (fundBounty.status === "error") {
    statusTone = "error";
    statusTitle = "Funding failed";
    statusCopy = describeRialoError(fundBounty.error);
    buttonLabel = "Try funding again";
  } else if (fundBounty.status === "success") {
    statusTone = "success";
    statusTitle = "Escrow funded";
    statusCopy = "Rialo confirmed funding. Autonomous GitHub merge checks are now armed.";
    buttonLabel = "Funding confirmed";
  }

  async function fund() {
    try {
      const result = await fundBounty.execute({
        workflowSlug,
        sponsor: workflow.state.sponsor,
      });
      onConfirmed(result.signature);
    } catch {
      // The action status keeps the exact preflight or transaction failure visible.
    }
  }

  return (
    <section className={"workflow-fund workflow-fund--" + statusTone}>
      <div className="workflow-fund__copy">
        <p className="panel-label">NEXT ACTION / SPONSOR ONLY</p>
        <h3>Fund escrow</h3>
        <p>{statusCopy}</p>
      </div>
      <div className="workflow-fund__amount">
        <span>Committed amount</span>
        <strong>{formatRlo(workflow.state.amountKelvin)} RLO</strong>
        <small>Exact amount locked on-chain</small>
      </div>
      <div className="workflow-fund__submit">
        <span aria-live="polite" data-tone={statusTone}>
          {statusTone === "success" ? <Check aria-hidden="true" size={13} /> : statusTone === "error" ? <CircleAlert aria-hidden="true" size={13} /> : null}
          {statusTitle}
        </span>
        <button className="button" disabled={unavailable} onClick={fund} type="button">
          {busy ? <LoaderCircle aria-hidden="true" className="ui-icon ui-icon--spin" size={15} /> : fundBounty.status === "success" ? <Check aria-hidden="true" className="ui-icon" size={15} /> : <LockKeyhole aria-hidden="true" className="ui-icon" size={15} />}
          {buttonLabel}
        </button>
      </div>
    </section>
  );
}
