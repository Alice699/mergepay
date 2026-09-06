"use client";

import type { DecodedMergePayWorkflow } from "@mergepay/rialo-client";
import { Check, CircleAlert, LoaderCircle, RadioTower, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FundBountyAction } from "@/features/fund-bounty/components/fund-bounty-action";
import { CheckMergeAction } from "@/features/check-merge/components/check-merge-action";
import type { CheckMergeResult } from "@/features/check-merge/use-check-merge";
import { RefundBountyAction } from "@/features/refund-bounty/components/refund-bounty-action";
import { useDeadlinePassed } from "@/hooks/use-deadline-passed";
import { useNetwork } from "@/hooks/use-network";
import { useWallet } from "@/hooks/use-wallet";
import { useWorkflow } from "@/hooks/use-workflow";
import { routes } from "@/lib/constants";
import { formatRlo, shortenAddress } from "@/lib/format";
import { CopyValue } from "@/components/ui/copy-value";

interface WorkflowDetailProps {
  slug: string;
  sponsorHint: string | null;
  transactionSignature: string | null;
  callbackSignature: string | null;
  transactionKind: "create" | "fund" | "check" | "refund";
}

interface ConfirmedTransaction {
  signature: string;
  callbackSignature: string | null;
  kind: "create" | "fund" | "check" | "refund";
}

function formatDeadline(deadlineUnixMs: bigint): string {
  const date = new Date(Number(deadlineUnixMs));
  if (!Number.isFinite(date.getTime())) return "Unavailable";

  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date) + " UTC"
  );
}

function workflowStatus(workflow: DecodedMergePayWorkflow) {
  if (workflow.state.paid) return { label: "Paid", className: "state--good" };
  if (workflow.state.refunded) return { label: "Refunded", className: "state--good" };
  if (workflow.state.mergeConfirmed) {
    return { label: "Merge confirmed", className: "state--good" };
  }
  if (workflow.state.funded) return { label: "Funded", className: "state--good" };
  return { label: "Created", className: "state--warn" };
}

function WorkflowRecord({
  workflow,
  workflowSlug,
  onFundConfirmed,
  onCheckCompleted,
  onRefundConfirmed,
}: Readonly<{
  workflow: DecodedMergePayWorkflow;
  workflowSlug: string;
  onFundConfirmed: (signature: string) => void;
  onCheckCompleted: (result: CheckMergeResult) => void;
  onRefundConfirmed: (signature: string) => void;
}>) {
  const status = workflowStatus(workflow);
  const { state } = workflow;
  const deadlinePassed = useDeadlinePassed(state.deadlineUnixMs);
  const checks = [
    ["Created", state.initialized],
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
            <span>{state.amountKelvin.toString()} kelvin</span>
          </dd>
        </div>
        <div>
          <dt>Deadline</dt>
          <dd><strong>{formatDeadline(state.deadlineUnixMs)}</strong></dd>
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
          <dd><CopyValue value={state.beneficiary} /></dd>
        </div>
      </dl>

      {!state.funded && !state.paid && !state.refunded ? (
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
        <div>
          <p className="panel-label">WORKFLOW STATE</p>
          <p>Account balance: <strong>{formatRlo(workflow.account.kelvin)} RLO</strong></p>
        </div>
        <ul className="workflow-checks" aria-label="Workflow state">
          {checks.map(([label, complete]) => (
            <li data-complete={complete} key={label}>
              <span>{complete ? <Check aria-hidden="true" size={13} /> : null}</span>
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function WorkflowDetail({
  slug,
  sponsorHint,
  transactionSignature,
  callbackSignature,
  transactionKind,
}: Readonly<WorkflowDetailProps>) {
  const router = useRouter();
  const network = useNetwork();
  const wallet = useWallet();
  const [refreshToken, setRefreshToken] = useState(0);
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
  const sponsor = sponsorHint?.trim() || wallet.address;

  const loadWorkflow = useCallback(
    (requestedSlug: string) => {
      if (!sponsor) {
        return Promise.reject(
          new Error("Connect the wallet that created this workflow to read its account."),
        );
      }
      return network.client.getWorkflow(sponsor, requestedSlug);
    },
    [network.client, sponsor],
  );

  const workflowRead = useWorkflow<DecodedMergePayWorkflow | null>(
    network.rpcStatus === "available" && sponsor ? slug : null,
    loadWorkflow,
    refreshToken,
  );
  const workflow = workflowRead.workflow;
  const pendingStateSignature =
    confirmedTransaction?.kind === "check" &&
    !confirmedTransaction.callbackSignature &&
    !workflow?.state.paid
      ? confirmedTransaction.signature
      : confirmedTransaction?.kind === "refund" && !workflow?.state.refunded
        ? confirmedTransaction.signature
        : null;

  useEffect(() => {
    if (!pendingStateSignature) return;

    let reads = 0;
    const interval = window.setInterval(() => {
      reads += 1;
      setRefreshToken((value) => value + 1);
      if (reads >= 24) window.clearInterval(interval);
    }, 1_500);

    return () => window.clearInterval(interval);
  }, [pendingStateSignature]);

  const readLoading =
    Boolean(sponsor) &&
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

  function handleFundConfirmed(signature: string) {
    const confirmedSponsor = workflow?.state.sponsor ?? sponsor;
    setConfirmedTransaction({ signature, callbackSignature: null, kind: "fund" });
    setRefreshToken((value) => value + 1);

    const query = new URLSearchParams({ event: "fund", tx: signature });
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
      "Escrow funding executed on Rialo. The updated account is being read from DevNet.";
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
    readCopy = "Rialo returned an error while reading this account. Nothing is inferred or replaced with sample data.";
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
            onCheckCompleted={handleCheckCompleted}
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
            {sponsor ? <li><span>Sponsor</span><strong className="mono" title={sponsor}>{shortenAddress(sponsor, 6)}</strong></li> : null}
          </ul>
          <p className="panel-note">Every value is read from Rialo. A missing account or RPC failure stays visible as a missing account or RPC failure.</p>
        </aside>
      </div>
    </div>
  );
}
