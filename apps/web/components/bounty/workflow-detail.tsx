"use client";

import {
  MERGEPAY_UNASSIGNED_BENEFICIARY,
  type DecodedMergePayWorkflow,
} from "@mergepay/rialo-client";
import { Check, CircleAlert, LoaderCircle, RadioTower, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AcceptClaimAction } from "@/features/claim-bounty/components/accept-claim-action";
import { RequestClaimAction } from "@/features/claim-bounty/components/request-claim-action";
import type { AcceptClaimResult } from "@/features/claim-bounty/use-accept-claim";
import type { RequestClaimResult } from "@/features/claim-bounty/use-request-claim";
import { FundBountyAction } from "@/features/fund-bounty/components/fund-bounty-action";
import { CheckMergeAction } from "@/features/check-merge/components/check-merge-action";
import type { CheckMergeResult } from "@/features/check-merge/use-check-merge";
import { RefundBountyAction } from "@/features/refund-bounty/components/refund-bounty-action";
import { useDeadlinePassed } from "@/hooks/use-deadline-passed";
import { useNetwork } from "@/hooks/use-network";
import { useWallet } from "@/hooks/use-wallet";
import { useWorkflow } from "@/hooks/use-workflow";
import { routes } from "@/lib/constants";
import { publishAppNotification } from "@/lib/app-notifications";
import { formatDeadline, formatRlo, shortenAddress } from "@/lib/format";
import { CopyValue } from "@/components/ui/copy-value";

interface WorkflowDetailProps {
  slug: string;
  sponsorHint: string | null;
  claimWorkflowHint: string | null;
  transactionSignature: string | null;
  callbackSignature: string | null;
  transactionKind: "create" | "fund" | "check" | "refund" | "claim" | "accept_claim";
  workflowAddressHint: string | null;
}

interface ConfirmedTransaction {
  signature: string;
  callbackSignature: string | null;
  kind: "create" | "fund" | "check" | "refund" | "claim" | "accept_claim";
}

function workflowStatus(workflow: DecodedMergePayWorkflow) {
  if (workflow.state.paid) return { label: "Paid", className: "state--good" };
  if (workflow.state.refunded) return { label: "Refunded", className: "state--good" };
  if (workflow.state.mergeConfirmed) {
    return { label: "Merge confirmed", className: "state--good" };
  }
  if (workflow.state.funded) return { label: "Funded", className: "state--good" };
  if (workflow.state.beneficiary !== MERGEPAY_UNASSIGNED_BENEFICIARY) {
    return { label: "Claimed", className: "state--good" };
  }
  if (workflow.state.claimRequest) {
    return { label: "Claim requested", className: "state--warn" };
  }
  return { label: "Open claim", className: "state--warn" };
}

const LIVE_WORKFLOW_POLL_INTERVAL_MS = 2_500;
const PENDING_TRANSACTION_POLL_INTERVAL_MS = 1_500;
const MAX_PENDING_TRANSACTION_READS = 24;

function WorkflowRecord({
  workflow,
  workflowSlug,
  claimWorkflowHint,
  onFundConfirmed,
  onCheckCompleted,
  onRefundConfirmed,
  onClaimSubmitted,
  onClaimAccepted,
}: Readonly<{
  workflow: DecodedMergePayWorkflow;
  workflowSlug: string;
  claimWorkflowHint: string | null;
  onFundConfirmed: (signature: string) => void;
  onCheckCompleted: (result: CheckMergeResult) => void;
  onRefundConfirmed: (signature: string) => void;
  onClaimSubmitted: (result: RequestClaimResult) => void;
  onClaimAccepted: (result: AcceptClaimResult) => void;
}>) {
  const status = workflowStatus(workflow);
  const { state } = workflow;
  const deadlinePassed = useDeadlinePassed(state.deadlineUnixMs);
  const isUnclaimed = state.beneficiary === MERGEPAY_UNASSIGNED_BENEFICIARY;
  const isSponsor = useWallet().address === state.sponsor;
  const checks = [
    ["Created", state.initialized],
    ["Claim approved", !isUnclaimed],
    ["Funded", state.funded],
    ["Merge confirmed", state.mergeConfirmed],
    ["Paid", state.paid],
    ["Refunded", state.refunded],
  ] as const;

  return (
    <section className="panel workflow-record" aria-live="polite">
      <div className="workflow-record__header">
        <div>
          <p className="eyebrow">Verified account</p>
          <h2>Workflow is live.</h2>
          <p>The fields below were decoded from this exact Rialo workflow account.</p>
        </div>
        <strong className={"state " + status.className}>{status.label}</strong>
      </div>

      <dl className="workflow-record__grid">
        <div>
          <dt>GitHub target</dt>
          <dd>
            <strong>{state.githubOwner + "/" + state.githubRepo}</strong>
            <span>Pull request #{state.pullNumber.toString()}</span>
          </dd>
        </div>
        <div>
          <dt>Bounty amount</dt>
          <dd>
            <strong>{formatRlo(state.amountKelvin)} RLO</strong>
            <span>Exact reward for the approved contributor</span>
          </dd>
        </div>
        <div>
          <dt>Deadline</dt>
          <dd><strong suppressHydrationWarning>{formatDeadline(state.deadlineUnixMs)}</strong></dd>
        </div>
        <div>
          <dt>Workflow account</dt>
          <dd><CopyValue value={workflow.address} /></dd>
        </div>
        <div>
          <dt>Sponsor</dt>
          <dd><CopyValue value={state.sponsor} /></dd>
        </div>
        <div>
          <dt>Beneficiary</dt>
          {isUnclaimed ? (
            <dd><strong>Waiting for approved claim</strong><span>Contributor wallet is not assigned</span></dd>
          ) : (
            <dd>
              <CopyValue value={state.beneficiary} />
              {state.claimantGithub ? <span>@{state.claimantGithub}{state.claimantGithubId > 0n ? ` · GitHub ${state.claimantGithubId.toString()}` : ""}</span> : null}
            </dd>
          )}
        </div>
      </dl>

      {isUnclaimed && !state.claimRequest && !isSponsor && !claimWorkflowHint ? (
        <RequestClaimAction
          onConfirmed={onClaimSubmitted}
          workflow={workflow}
        />
      ) : null}

      {isUnclaimed && !state.claimRequest && isSponsor ? (
        <AcceptClaimAction
          key={claimWorkflowHint ?? "manual-claim-approval"}
          claimWorkflowHint={claimWorkflowHint}
          onConfirmed={onClaimAccepted}
          workflow={workflow}
          workflowSlug={workflowSlug}
        />
      ) : null}

      {isUnclaimed && !state.claimRequest && !isSponsor && claimWorkflowHint ? (
        <section className="workflow-claim workflow-claim--shared">
          <div className="workflow-claim__copy">
            <p className="panel-label">CLAIM REQUEST READY</p>
            <h3>Waiting for sponsor approval</h3>
            <p>Share this contributor claim record with the sponsor. The bounty cannot be funded until the sponsor approves it.</p>
          </div>
          <div className="workflow-claim__record">
            <span>Claim record address</span>
            <CopyValue value={claimWorkflowHint} />
          </div>
        </section>
      ) : null}

      {!isUnclaimed && !state.funded && !state.paid && !state.refunded ? (
        <FundBountyAction
          onConfirmed={onFundConfirmed}
          workflow={workflow}
          workflowSlug={workflowSlug}
        />
      ) : null}

      {state.funded && !state.paid && !state.refunded && !deadlinePassed ? (
        <CheckMergeAction
          onCompleted={onCheckCompleted}
          workflow={workflow}
          workflowSlug={workflowSlug}
        />
      ) : null}

      {state.funded && !state.paid && !state.refunded && deadlinePassed ? (
        <RefundBountyAction
          onConfirmed={onRefundConfirmed}
          workflow={workflow}
          workflowSlug={workflowSlug}
        />
      ) : null}

      <div className="workflow-record__footer">
        <div className="workflow-record__balance">
          <p className="panel-label">WORKFLOW STATE</p>
          <p><span>Account balance</span><strong>{formatRlo(workflow.account.kelvin)} RLO</strong></p>
        </div>
        <div className="workflow-record__lifecycle">
          <p className="panel-label">ONCHAIN LIFECYCLE</p>
          <ul className="workflow-checks" aria-label="Workflow state">
            {checks.map(([label, complete]) => (
              <li aria-label={`${label}: ${complete ? "complete" : "not complete"}`} data-complete={complete} key={label}>
                <span>{complete ? <Check aria-hidden="true" size={13} /> : null}</span>
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function WorkflowDetail({
  slug,
  sponsorHint,
  claimWorkflowHint,
  transactionSignature,
  callbackSignature,
  transactionKind,
  workflowAddressHint,
}: Readonly<WorkflowDetailProps>) {
  const router = useRouter();
  const network = useNetwork();
  const wallet = useWallet();
  const accountHint = workflowAddressHint?.trim() || null;
  const [refreshToken, setRefreshToken] = useState(0);
  const observedWorkflowState = useRef<{
    address: string;
    terminal: "paid" | "refunded" | null;
  } | null>(null);
  const [confirmedTransaction, setConfirmedTransaction] =
    useState<ConfirmedTransaction | null>(
      transactionSignature
        ? {
            signature: transactionSignature,
            callbackSignature,
            kind: transactionKind,
          }
        : null,
    );
  const sponsor = sponsorHint?.trim() || (accountHint ? null : wallet.address);
  const lookupKey = accountHint || (sponsor ? slug : null);

  const loadWorkflow = useCallback(
    (requestedSlug: string) => {
      if (accountHint) {
        return network.client.getWorkflowByAddress(accountHint);
      }
      if (!sponsor) {
        return Promise.reject(
          new Error("Connect the wallet that created this workflow to read its account."),
        );
      }
      return network.client.getWorkflow(sponsor, requestedSlug);
    },
    [accountHint, network.client, sponsor],
  );

  const workflowRead = useWorkflow<DecodedMergePayWorkflow | null>(
    network.rpcStatus === "available" && lookupKey ? lookupKey : null,
    loadWorkflow,
    refreshToken,
  );
  const workflow = workflowRead.workflow;
  const displaySponsor = workflow?.state.sponsor ?? sponsor;
  const confirmedStateIsPending = Boolean(
    confirmedTransaction &&
      ((confirmedTransaction.kind === "create" && !workflow) ||
        (confirmedTransaction.kind === "fund" && !workflow?.state.funded) ||
        (confirmedTransaction.kind === "check" &&
          !confirmedTransaction.callbackSignature &&
          !workflow?.state.paid) ||
        (confirmedTransaction.kind === "refund" && !workflow?.state.refunded) ||
        (confirmedTransaction.kind === "accept_claim" &&
          workflow?.state.beneficiary === MERGEPAY_UNASSIGNED_BENEFICIARY)),
  );
  const pendingStateSignature = confirmedStateIsPending
    ? confirmedTransaction?.signature ?? null
    : null;
  const liveSettlementActive = Boolean(
    workflow?.state.funded && !workflow.state.paid && !workflow.state.refunded,
  );

  useEffect(() => {
    if (!pendingStateSignature && !liveSettlementActive) return;

    let reads = 0;
    const intervalMs = pendingStateSignature
      ? PENDING_TRANSACTION_POLL_INTERVAL_MS
      : LIVE_WORKFLOW_POLL_INTERVAL_MS;
    function refreshWorkflow() {
      if (document.visibilityState !== "visible") return;
      reads += 1;
      setRefreshToken((value) => value + 1);
      if (
        pendingStateSignature &&
        !liveSettlementActive &&
        reads >= MAX_PENDING_TRANSACTION_READS
      ) {
        window.clearInterval(interval);
      }
    }
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshWorkflow();
    };
    const interval = window.setInterval(() => {
      refreshWorkflow();
    }, intervalMs);

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [liveSettlementActive, pendingStateSignature]);

  useEffect(() => {
    if (!workflow) return;

    const terminal = workflow.state.paid
      ? "paid"
      : workflow.state.refunded
        ? "refunded"
        : null;
    const previous = observedWorkflowState.current;

    if (!previous || previous.address !== workflow.address) {
      observedWorkflowState.current = { address: workflow.address, terminal };
      return;
    }

    if (!previous.terminal && terminal === "paid") {
      publishAppNotification({
        title: "Bounty payout complete",
        message: `${formatRlo(workflow.state.amountKelvin)} RLO was released to the approved contributor.`,
        tone: "success",
      });
    } else if (!previous.terminal && terminal === "refunded") {
      publishAppNotification({
        title: "Escrow refund complete",
        message: `${formatRlo(workflow.state.amountKelvin)} RLO was returned to the sponsor.`,
        tone: "success",
      });
    }

    observedWorkflowState.current = { address: workflow.address, terminal };
  }, [workflow]);

  const readLoading =
    Boolean(lookupKey) &&
    (network.rpcStatus === "checking" ||
      workflowRead.status === "idle" ||
      workflowRead.status === "loading");
  const readError = network.rpcStatus === "unavailable" || workflowRead.status === "error";
  const decoderLabel = workflow
    ? "Verified"
    : readLoading
      ? "Reading"
      : readError
        ? "Unavailable"
        : "Not found";
  const decoderGood = Boolean(workflow);
  const rpcLabel =
    network.rpcStatus === "available"
      ? "Connected"
      : network.rpcStatus === "checking"
        ? "Checking"
        : "Unavailable";

  function retryRead() {
    setRefreshToken((value) => value + 1);
    network.refreshRpcHealth();
  }

  function addWorkflowAccount(query: URLSearchParams) {
    const account = workflow?.address ?? accountHint;
    if (account) query.set("account", account);
  }

  function handleFundConfirmed(signature: string) {
    const confirmedSponsor = workflow?.state.sponsor ?? sponsor;
    setConfirmedTransaction({ signature, callbackSignature: null, kind: "fund" });
    setRefreshToken((value) => value + 1);

    const query = new URLSearchParams({ event: "fund", tx: signature });
    addWorkflowAccount(query);
    if (confirmedSponsor) query.set("sponsor", confirmedSponsor);
    router.replace(routes.bounty(slug) + "?" + query.toString(), { scroll: false });
  }

  function handleCheckCompleted(result: CheckMergeResult) {
    const confirmedSponsor = workflow?.state.sponsor ?? sponsor;
    setConfirmedTransaction({
      signature: result.signature,
      callbackSignature: result.callbackSignature,
      kind: "check",
    });
    setRefreshToken((value) => value + 1);

    const query = new URLSearchParams({ event: "check", tx: result.signature });
    addWorkflowAccount(query);
    if (result.callbackSignature) query.set("callback", result.callbackSignature);
    if (confirmedSponsor) query.set("sponsor", confirmedSponsor);
    router.replace(routes.bounty(slug) + "?" + query.toString(), { scroll: false });
  }

  function handleRefundConfirmed(signature: string) {
    const confirmedSponsor = workflow?.state.sponsor ?? sponsor;
    setConfirmedTransaction({
      signature,
      callbackSignature: null,
      kind: "refund",
    });
    setRefreshToken((value) => value + 1);

    const query = new URLSearchParams({ event: "refund", tx: signature });
    addWorkflowAccount(query);
    if (confirmedSponsor) query.set("sponsor", confirmedSponsor);
    router.replace(routes.bounty(slug) + "?" + query.toString(), { scroll: false });
  }

  function handleClaimSubmitted(result: RequestClaimResult) {
    const confirmedSponsor = workflow?.state.sponsor ?? sponsor;
    setConfirmedTransaction({ signature: result.signature, callbackSignature: null, kind: "claim" });
    setRefreshToken((value) => value + 1);

    const query = new URLSearchParams({
      event: "claim",
      tx: result.signature,
      claim: result.claimWorkflowAddress,
    });
    addWorkflowAccount(query);
    if (confirmedSponsor) query.set("sponsor", confirmedSponsor);
    router.replace(routes.bounty(slug) + "?" + query.toString(), { scroll: false });
  }

  function handleClaimAccepted(result: AcceptClaimResult) {
    const confirmedSponsor = workflow?.state.sponsor ?? sponsor;
    setConfirmedTransaction({ signature: result.signature, callbackSignature: null, kind: "accept_claim" });
    setRefreshToken((value) => value + 1);

    const query = new URLSearchParams({ event: "accept_claim", tx: result.signature });
    addWorkflowAccount(query);
    if (confirmedSponsor) query.set("sponsor", confirmedSponsor);
    router.replace(routes.bounty(slug) + "?" + query.toString(), { scroll: false });
  }

  let confirmationTitle = "Transaction confirmed";
  let confirmationCopy =
    "Create bounty executed on Rialo. The account below is being read from DevNet.";
  let confirmationTone = "success";
  if (confirmedTransaction?.kind === "fund") {
    confirmationTitle = "Funding confirmed";
    confirmationCopy =
      "Escrow funding executed on Rialo. The native settlement heartbeat is now armed for merge polling and deadline refund; the updated account is being read from DevNet.";
  } else if (confirmedTransaction?.kind === "refund") {
    if (workflow?.state.refunded) {
      confirmationTitle = "Refund confirmed";
      confirmationCopy =
        "Rialo returned the expired escrow to the sponsor and preserved the workflow rent reserve.";
    } else {
      confirmationTone = "pending";
      confirmationTitle = "Refund transaction confirmed";
      confirmationCopy =
        "The refund executed on Rialo. The updated workflow account is being decoded from DevNet.";
    }
  } else if (confirmedTransaction?.kind === "check") {
    if (workflow?.state.mergeConfirmed && workflow.state.paid) {
      confirmationTitle = "Payout confirmed";
      confirmationCopy =
        "Rialo REX returned unanimous merge proof and released the escrow to the beneficiary.";
    } else if (confirmedTransaction.callbackSignature) {
      confirmationTone = "warning";
      confirmationTitle = "Merge check completed";
      confirmationCopy =
        "The callback completed without unanimous payout proof. Escrow remains locked on Rialo.";
    } else {
      confirmationTone = "pending";
      confirmationTitle = "Merge check submitted";
      confirmationCopy =
        "The initiating transaction executed. Rialo REX is processing the GitHub proof callback.";
    }
  } else if (confirmedTransaction?.kind === "claim") {
    confirmationTitle = "Claim request confirmed";
    confirmationCopy =
      "The contributor claim record is live on Rialo. Share its address with the sponsor for approval.";
  } else if (confirmedTransaction?.kind === "accept_claim") {
    if (workflow && workflow.state.beneficiary !== MERGEPAY_UNASSIGNED_BENEFICIARY) {
      confirmationTitle = "Claim approved";
      confirmationCopy =
        "The sponsor locked the contributor wallet. Funding is now available for this bounty.";
    } else {
      confirmationTone = "pending";
      confirmationTitle = "Claim approval submitted";
      confirmationCopy =
        "The approval transaction executed. Rialo is refreshing the workflow beneficiary.";
    }
  }

  let readTitle = "Reading workflow account.";
  let readCopy = "Rialo is decoding the exact PDA derived from this sponsor and workflow ID.";
  if (!sponsor) {
    readTitle = "Connect the creating wallet.";
    readCopy = "This workflow ID needs the sponsor address that created its PDA. Connect that wallet or open the link created after signing.";
  } else if (network.rpcStatus === "unavailable") {
    readTitle = "Rialo RPC is unavailable.";
    readCopy = "The transaction may already be confirmed, but the account cannot be verified until the DevNet RPC responds.";
  } else if (workflowRead.status === "error") {
    readTitle = "Workflow could not be verified.";
    readCopy = workflowRead.error?.message
      ? `Rialo returned an error while reading this account: ${workflowRead.error.message}`
      : "Rialo returned an error while reading this account. Nothing is inferred or replaced with sample data.";
  } else if (workflowRead.status === "success" && !workflow) {
    readTitle = confirmedTransaction
      ? "Transaction confirmed. Account read is still catching up."
      : "Workflow account not found.";
    readCopy = confirmedTransaction
      ? confirmedTransaction.kind === "fund"
        ? "The funding transaction executed, but the refreshed account is not visible yet. Retry the read in a moment."
        : confirmedTransaction.kind === "check"
          ? "The merge check executed, but this workflow account cannot be read yet. Retry without assuming a payout."
          : confirmedTransaction.kind === "refund"
            ? "The refund transaction executed, but the updated account cannot be read yet. Retry without assuming its terminal state."
            : confirmedTransaction.kind === "claim"
              ? "The claim transaction executed, but the sponsor-owned bounty is unchanged until approval. Keep the claim record address from the confirmation above."
              : confirmedTransaction.kind === "accept_claim"
                ? "The approval transaction executed, but the beneficiary change is not visible yet. Retry the account read before funding."
                : "The create transaction executed, but this account read returned no data yet. Retry the read in a moment."
      : "No initialized workflow was returned for this sponsor and workflow ID.";
  }

  return (
    <div className="workflow-detail">
      {confirmedTransaction ? (
        <section className="workflow-confirmation" data-tone={confirmationTone} aria-live="polite">
          <span className="workflow-confirmation__icon">
            {confirmationTone === "success" ? <Check aria-hidden="true" size={17} /> : confirmationTone === "warning" ? <CircleAlert aria-hidden="true" size={17} /> : <RadioTower aria-hidden="true" size={17} />}
          </span>
          <div>
            <p>{confirmationTitle}</p>
            <span>{confirmationCopy}</span>
          </div>
          <CopyValue value={confirmedTransaction.signature} />
        </section>
      ) : null}

      <div className="content-grid workflow-detail__grid">
        {workflow ? (
          <WorkflowRecord
            claimWorkflowHint={claimWorkflowHint}
            onCheckCompleted={handleCheckCompleted}
            onClaimAccepted={handleClaimAccepted}
            onClaimSubmitted={handleClaimSubmitted}
            onFundConfirmed={handleFundConfirmed}
            onRefundConfirmed={handleRefundConfirmed}
            workflow={workflow}
            workflowSlug={slug}
          />
        ) : (
          <section className="panel workflow-read-state" aria-live="polite">
            <div className="empty-signal">
              {readLoading ? <LoaderCircle aria-hidden="true" className="ui-icon--spin" size={16} /> : <CircleAlert aria-hidden="true" size={16} />}
            </div>
            <p className="eyebrow">{readLoading ? "Reading account" : readError ? "Read unavailable" : "Account status"}</p>
            <h2>{readTitle}</h2>
            <p>{readCopy}</p>
            {readError || (workflowRead.status === "success" && !workflow) ? (
              <button className="button" onClick={retryRead} type="button">
                <RefreshCw aria-hidden="true" className="ui-icon" size={15} />
                Retry account read
              </button>
            ) : null}
          </section>
        )}

        <aside className="panel readiness-panel">
          <p className="panel-label">LIVE DATA SOURCE</p>
          <ul>
            <li><span>Identifier</span><strong className="state state--good">Valid</strong></li>
            <li><span>Network</span><strong>{network.label.replace("Rialo ", "")}</strong></li>
            <li><span>RPC</span><strong className={network.rpcStatus === "available" ? "state state--good" : "state"}>{rpcLabel}</strong></li>
            <li><span>Decoder</span><strong className={decoderGood ? "state state--good" : "state"}>{decoderLabel}</strong></li>
            {displaySponsor ? <li><span>Sponsor</span><strong className="mono" title={displaySponsor}>{shortenAddress(displaySponsor, 6)}</strong></li> : null}
          </ul>
          <p className="panel-note">Every value is read from Rialo. A missing account or RPC failure stays visible as a missing account or RPC failure.</p>
        </aside>
      </div>
    </div>
  );
}
