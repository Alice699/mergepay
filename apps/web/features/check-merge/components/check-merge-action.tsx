"use client";

import type { DecodedMergePayWorkflow } from "@mergepay/rialo-client";
import {
  Check,
  CircleAlert,
  GitPullRequest,
  LoaderCircle,
  RadioTower,
} from "lucide-react";
import {
  type CheckMergeResult,
  useCheckMerge,
} from "@/features/check-merge/use-check-merge";
import { useDeadlinePassed } from "@/hooks/use-deadline-passed";
import { useNetwork } from "@/hooks/use-network";
import { useWallet } from "@/hooks/use-wallet";
import { describeRialoError } from "@/lib/errors";

interface CheckMergeActionProps {
  workflow: DecodedMergePayWorkflow;
  workflowSlug: string;
  onCompleted: (result: CheckMergeResult) => void;
}

export function CheckMergeAction({
  workflow,
  workflowSlug,
  onCompleted,
}: Readonly<CheckMergeActionProps>) {
  const wallet = useWallet();
  const network = useNetwork();
  const checkMerge = useCheckMerge();
  const phase = checkMerge.transaction.phase;
  const result = checkMerge.result;
  const isSponsor = wallet.address === workflow.state.sponsor;
  const deadlinePassed = useDeadlinePassed(workflow.state.deadlineUnixMs);
  const busy = checkMerge.status === "pending";
  const unavailable =
    wallet.status !== "connected" ||
    !wallet.address ||
    !isSponsor ||
    !network.isExpectedNetwork ||
    network.rpcStatus !== "available" ||
    deadlinePassed ||
    busy ||
    result?.outcome === "paid" ||
    result?.outcome === "pending";

  let statusTone = "idle";
  let statusTitle = workflow.state.checks > 0n ? "Autonomous watch active" : "Autonomous watch armed";
  let statusCopy =
    workflow.state.checks > 0n
      ? "Rialo is polling the GitHub proof until the PR merges or the deadline expires. You can request an immediate fallback check."
      : "Rialo will check GitHub automatically after funding. Only unanimous merged proof releases escrow.";
  let buttonLabel = "Run check now";

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
    statusCopy = "Merge verification unlocks when the DevNet connection is ready.";
  } else if (network.rpcStatus === "unavailable") {
    statusTone = "error";
    statusTitle = "RPC unavailable";
    statusCopy = "Rialo DevNet cannot be reached right now.";
  } else if (deadlinePassed) {
    statusTone = "error";
    statusTitle = "Deadline passed";
    statusCopy = "Merge checks are closed. The sponsor can now recover the escrow.";
  } else if (busy) {
    statusTone = "pending";
    if (phase === "reviewing") {
      statusTitle = "Review merge check";
      statusCopy = "Confirm the GitHub target and workflow account before signing the fallback request.";
      buttonLabel = "Awaiting review";
    } else if (phase === "signing") {
      statusTitle = "Awaiting signature";
      statusCopy = "Approve the one-shot REX fallback request in the sponsor wallet.";
      buttonLabel = "Awaiting signature";
    } else if (phase === "confirmed") {
      statusTitle = "Waiting for REX callback";
      statusCopy = "The fallback request executed. Rialo is collecting validator responses while the native loop remains armed.";
      buttonLabel = "Reading proof";
    } else {
      statusTitle = "Submitting merge check";
      statusCopy = "The signed request is being confirmed by Rialo.";
      buttonLabel = "Confirming";
    }
  } else if (checkMerge.status === "error") {
    statusTone = "error";
    statusTitle = "Fallback check failed";
    statusCopy = describeRialoError(checkMerge.error) + " The native settlement loop remains the primary path after funding.";
    buttonLabel = "Try fallback again";
  } else if (result?.outcome === "paid") {
    statusTone = "success";
    statusTitle = "Payout confirmed";
    statusCopy = "Rialo verified unanimous merge proof and released the escrow.";
    buttonLabel = "Bounty paid";
  } else if (result?.outcome === "no-payout") {
    statusTone = "warning";
    statusTitle = "Watching for merge";
    statusCopy = "This proof did not release escrow. The native timer has scheduled another check before the deadline.";
  } else if (result?.outcome === "callback-failed") {
    statusTone = "error";
    statusTitle = "Callback needs another attempt";
    statusCopy = "The fallback callback failed, but funds remain safely locked and the native loop can retry.";
    buttonLabel = "Run fallback again";
  } else if (result?.outcome === "pending") {
    statusTone = "warning";
    statusTitle = "Callback still pending";
    statusCopy = "The fallback request is confirmed. Rialo's native settlement loop remains active while the callback is exposed.";
    buttonLabel = "Check submitted";
  }

  async function check() {
    try {
      const completed = await checkMerge.execute({
        workflowSlug,
        sponsor: workflow.state.sponsor,
      });
      onCompleted(completed);
    } catch {
      // The action status keeps the exact preflight or transaction failure visible.
    }
  }

  const githubUrl =
    "https://github.com/" +
    encodeURIComponent(workflow.state.githubOwner) +
    "/" +
    encodeURIComponent(workflow.state.githubRepo) +
    "/pull/" +
    workflow.state.pullNumber.toString();

  return (
    <section className={"workflow-check workflow-check--" + statusTone}>
      <div className="workflow-check__copy">
        <p className="panel-label">RIALO REACTIVE / SPONSOR FALLBACK</p>
        <h3>Autonomous settlement</h3>
        <p>{statusCopy}</p>
      </div>
      <a
        className="workflow-check__target"
        href={githubUrl}
        rel="noreferrer"
        target="_blank"
      >
        <span>GitHub proof target</span>
        <strong>{workflow.state.githubOwner + "/" + workflow.state.githubRepo}</strong>
        <small><GitPullRequest aria-hidden="true" size={11} /> Pull request #{workflow.state.pullNumber.toString()}</small>
      </a>
      <div className="workflow-check__submit">
        <span aria-live="polite" data-tone={statusTone}>
          {statusTone === "success" ? <Check aria-hidden="true" size={13} /> : statusTone === "error" ? <CircleAlert aria-hidden="true" size={13} /> : null}
          {statusTitle}
        </span>
        <button className="button" disabled={unavailable} onClick={check} type="button">
          {busy ? <LoaderCircle aria-hidden="true" className="ui-icon ui-icon--spin" size={15} /> : result?.outcome === "paid" ? <Check aria-hidden="true" className="ui-icon" size={15} /> : <RadioTower aria-hidden="true" className="ui-icon" size={15} />}
          {buttonLabel}
        </button>
      </div>
    </section>
  );
}
