"use client";

import type { DecodedMergePayWorkflow } from "@mergepay/rialo-client";
import {
  Activity,
  BadgeCheck,
  Check,
  CircleAlert,
  Clock3,
  GitPullRequest,
  LoaderCircle,
  RadioTower,
  ReceiptText,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CopyValue } from "@/components/ui/copy-value";
import { useNetwork } from "@/hooks/use-network";
import { useWallet } from "@/hooks/use-wallet";
import { useWorkflow } from "@/hooks/use-workflow";
import { routes } from "@/lib/constants";
import { formatDeadline, formatRlo } from "@/lib/format";
import { requestWalletControlOpen } from "@/lib/wallet-control-events";

const RECEIPT_POLL_INTERVAL_MS = 2_500;

interface SettlementReceiptProps {
  slug: string;
  sponsorHint: string | null;
  workflowAddressHint: string | null;
}

type TerminalState = "paid" | "refunded";

export function SettlementReceipt({
  slug,
  sponsorHint,
  workflowAddressHint,
}: Readonly<SettlementReceiptProps>) {
  const network = useNetwork();
  const wallet = useWallet();
  const accountHint = workflowAddressHint?.trim() || null;
  const sponsor = sponsorHint?.trim() || (accountHint ? null : wallet.address);
  const lookupKey = accountHint || (sponsor ? slug : null);
  const [refreshToken, setRefreshToken] = useState(0);

  const loadWorkflow = useCallback(
    (requestedSlug: string) => {
      if (accountHint) return network.client.getWorkflowByAddress(accountHint);
      if (!sponsor) {
        return Promise.reject(
          new Error(
            "Connect the sponsor wallet or open a receipt link containing the workflow account.",
          ),
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
  const terminalState: TerminalState | null = workflow?.state.paid && workflow.state.mergeConfirmed
    ? "paid"
    : workflow?.state.refunded
      ? "refunded"
      : null;
  const workflowMatchesReceipt = workflow
    ? network.client.deriveWorkflowPda(workflow.state.sponsor, slug).address ===
      workflow.address
    : true;
  const terminalFlagsAreConsistent = workflow
    ? !(
        (workflow.state.paid && workflow.state.refunded) ||
        (workflow.state.paid && !workflow.state.mergeConfirmed) ||
        ((workflow.state.paid || workflow.state.refunded) && !workflow.state.funded)
      )
    : true;
  const settlementPending = Boolean(
    workflow?.state.funded && !workflow.state.paid && !workflow.state.refunded,
  );

  useEffect(() => {
    if (!settlementPending) return;

    const refresh = () => {
      if (document.visibilityState === "visible") {
        setRefreshToken((value) => value + 1);
      }
    };
    const interval = window.setInterval(refresh, RECEIPT_POLL_INTERVAL_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [settlementPending]);

  function refreshReceipt() {
    setRefreshToken((value) => value + 1);
    network.refreshRpcHealth();
  }

  if (!lookupKey) {
    return (
      <ReceiptReadState
        action={
          <button className="button" onClick={requestWalletControlOpen} type="button">
            Open wallet
          </button>
        }
        copy="Connect the sponsor wallet to derive this workflow, or return to the workflow detail and open its shareable receipt link."
        icon={<WalletCards aria-hidden="true" size={21} strokeWidth={1.7} />}
        label="ACCOUNT REQUIRED"
        title="Choose the account to verify."
      />
    );
  }

  if (
    !workflow &&
    (network.rpcStatus === "checking" ||
      workflowRead.status === "idle" ||
      workflowRead.status === "loading")
  ) {
    return (
      <ReceiptReadState
        copy="MergePay is decoding the workflow account and its terminal settlement flags from Rialo DevNet."
        icon={<LoaderCircle aria-hidden="true" className="ui-icon--spin" size={21} />}
        label="READING DEVNET"
        title="Verifying the receipt."
      />
    );
  }

  if (!workflowMatchesReceipt || !terminalFlagsAreConsistent) {
    return (
      <ReceiptReadState
        copy={
          workflowMatchesReceipt
            ? "The workflow returned an inconsistent combination of funded, merged, paid, or refunded flags. MergePay will not present it as a successful settlement."
            : "The supplied account does not derive from this workflow ID and its decoded sponsor. Open the receipt from the matching workflow detail page."
        }
        icon={<CircleAlert aria-hidden="true" size={21} strokeWidth={1.7} />}
        label="PROOF MISMATCH"
        title="This receipt cannot be trusted."
        tone="error"
      />
    );
  }

  if (
    network.rpcStatus === "unavailable" ||
    workflowRead.status === "error" ||
    !workflow
  ) {
    const errorCopy =
      workflowRead.error?.message ??
      network.rpcError?.message ??
      "No initialized workflow account was returned for this receipt.";
    return (
      <ReceiptReadState
        action={
          <button className="button" onClick={refreshReceipt} type="button">
            <RefreshCw aria-hidden="true" className="ui-icon" size={15} />
            Retry verification
          </button>
        }
        copy={errorCopy}
        icon={<CircleAlert aria-hidden="true" size={21} strokeWidth={1.7} />}
        label="VERIFICATION INTERRUPTED"
        title="Receipt data is unavailable."
        tone="error"
      />
    );
  }

  if (!terminalState) {
    return (
      <PendingSettlementReceipt
        onRefresh={refreshReceipt}
        slug={slug}
        workflow={workflow}
      />
    );
  }

  return (
    <VerifiedSettlementReceipt
      slug={slug}
      terminalState={terminalState}
      workflow={workflow}
    />
  );
}

function VerifiedSettlementReceipt({
  slug,
  terminalState,
  workflow,
}: Readonly<{
  slug: string;
  terminalState: TerminalState;
  workflow: DecodedMergePayWorkflow;
}>) {
  const paid = terminalState === "paid";
  const destination = paid ? workflow.state.beneficiary : workflow.state.sponsor;
  const workflowUrl = workflowDetailHref(slug, workflow);
  const githubUrl = `https://github.com/${encodeURIComponent(workflow.state.githubOwner)}/${encodeURIComponent(workflow.state.githubRepo)}/pull/${workflow.state.pullNumber.toString()}`;

  return (
    <article
      aria-labelledby="settlement-receipt-title"
      aria-live="polite"
      className="settlement-receipt"
      data-outcome={terminalState}
    >
      <header className="settlement-receipt__header">
        <div className="settlement-receipt__seal" aria-hidden="true">
          <BadgeCheck size={27} strokeWidth={1.6} />
        </div>
        <div className="settlement-receipt__heading">
          <p className="eyebrow">VERIFIED SETTLEMENT · RIALO DEVNET</p>
          <h2 id="settlement-receipt-title">
            {paid ? "Bounty paid." : "Escrow refunded."}
          </h2>
          <p>
            {paid
              ? "The exact bounty amount was released to the approved contributor after the workflow recorded merged proof."
              : "The exact bounty amount was returned to the sponsor after the workflow reached its deadline."}
          </p>
        </div>
        <span className="settlement-receipt__verified">
          <i aria-hidden="true" /> Onchain verified
        </span>
      </header>

      <div className="settlement-receipt__amount">
        <span>{paid ? "PAID AMOUNT" : "REFUNDED AMOUNT"}</span>
        <strong>
          {formatRlo(workflow.state.amountKelvin)} <small>RLO</small>
        </strong>
        <p>Exact amount released from escrow</p>
      </div>

      <div className="settlement-receipt__terminal-proof">
        <span>TERMINAL WORKFLOW FLAG</span>
        <strong>
          <Check aria-hidden="true" size={14} strokeWidth={2.2} />
          {paid ? "paid = true" : "refunded = true"}
        </strong>
        <small>The opposite release path is permanently unavailable.</small>
      </div>

      <dl className="settlement-receipt__details">
        <div className="settlement-receipt__detail settlement-receipt__detail--destination">
          <dt>{paid ? "Paid to" : "Returned to"}</dt>
          <dd>
            <strong>{paid ? "Approved contributor" : "Workflow sponsor"}</strong>
            <CopyValue value={destination} />
          </dd>
        </div>
        <div>
          <dt>GitHub target</dt>
          <dd>
            <strong>
              {workflow.state.githubOwner}/{workflow.state.githubRepo}
            </strong>
            <a href={githubUrl} rel="noreferrer" target="_blank">
              <GitPullRequest aria-hidden="true" size={14} strokeWidth={1.8} />
              Pull request #{workflow.state.pullNumber.toString()}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </dd>
        </div>
        <div>
          <dt>Workflow account</dt>
          <dd>
            <CopyValue value={workflow.address} />
          </dd>
        </div>
        <div>
          <dt>Deadline</dt>
          <dd>
            <strong suppressHydrationWarning>
              {formatDeadline(workflow.state.deadlineUnixMs)}
            </strong>
          </dd>
        </div>
        <div>
          <dt>Settlement path</dt>
          <dd>
            <strong>{paid ? "Merged PR payout" : "Deadline refund"}</strong>
            <span>{paid ? "REX merge proof confirmed" : "Expired escrow recovered"}</span>
          </dd>
        </div>
        <div>
          <dt>Remaining account balance</dt>
          <dd>
            <strong>{formatRlo(workflow.account.kelvin)} RLO remains</strong>
            <span>The committed bounty is no longer held in escrow</span>
          </dd>
        </div>
      </dl>

      <footer className="settlement-receipt__footer">
        <div>
          <ReceiptText aria-hidden="true" size={18} strokeWidth={1.7} />
          <p>
            This receipt reflects the current decoded workflow account. It does
            not infer success from a toast, cached balance, or submitted transaction.
          </p>
        </div>
        <div className="settlement-receipt__actions">
          <Link className="button" href={workflowUrl}>
            View workflow
          </Link>
          <Link className="text-link" href={routes.activity}>
            <Activity aria-hidden="true" className="ui-icon" size={15} strokeWidth={1.8} />
            Wallet activity
          </Link>
        </div>
      </footer>
    </article>
  );
}

function PendingSettlementReceipt({
  onRefresh,
  slug,
  workflow,
}: Readonly<{
  onRefresh: () => void;
  slug: string;
  workflow: DecodedMergePayWorkflow;
}>) {
  const funded = workflow.state.funded;
  const workflowUrl = workflowDetailHref(slug, workflow);

  return (
    <article
      aria-labelledby="settlement-pending-title"
      aria-live="polite"
      className="settlement-receipt settlement-receipt--pending"
    >
      <header className="settlement-receipt__header">
        <div className="settlement-receipt__seal" aria-hidden="true">
          {funded ? (
            <RadioTower size={25} strokeWidth={1.6} />
          ) : (
            <Clock3 size={25} strokeWidth={1.6} />
          )}
        </div>
        <div className="settlement-receipt__heading">
          <p className="eyebrow">SETTLEMENT RECEIPT · NOT FINAL</p>
          <h2 id="settlement-pending-title">
            {funded ? "Settlement is still running." : "Escrow is not funded yet."}
          </h2>
          <p>
            {funded
              ? "The bounty remains locked while Rialo checks the merge signal and deadline. This receipt refreshes automatically while the page is visible."
              : "A paid or refunded receipt can only be issued after the sponsor approves the claim and funds the workflow."}
          </p>
        </div>
        <span className="settlement-receipt__verified" data-pending="true">
          <i aria-hidden="true" /> {funded ? "Heartbeat active" : "Awaiting funding"}
        </span>
      </header>

      <div className="settlement-receipt__pending-grid">
        <div data-complete="true">
          <span><Check aria-hidden="true" size={13} /> 01</span>
          <strong>Workflow created</strong>
        </div>
        <div data-complete={funded}>
          <span>{funded ? <Check aria-hidden="true" size={13} /> : null} 02</span>
          <strong>Escrow funded</strong>
        </div>
        <div data-active={funded}>
          <span>03</span>
          <strong>{funded ? "Watching terminal state" : "Settlement waiting"}</strong>
        </div>
      </div>

      <div className="settlement-receipt__pending-summary">
        <div>
          <span>COMMITTED BOUNTY</span>
          <strong>{formatRlo(workflow.state.amountKelvin)} RLO</strong>
        </div>
        <p>
          No success is claimed until the workflow reports <code>paid = true</code> or
          {" "}<code>refunded = true</code>.
        </p>
        <button className="button" onClick={onRefresh} type="button">
          <RefreshCw aria-hidden="true" className="ui-icon" size={15} />
          Refresh receipt
        </button>
      </div>

      <footer className="settlement-receipt__footer">
        <div>
          <RadioTower aria-hidden="true" size={18} strokeWidth={1.7} />
          <p>Automatic settlement runs on Rialo; keeping this page open is not required.</p>
        </div>
        <Link className="text-link" href={workflowUrl}>
          Return to workflow
        </Link>
      </footer>
    </article>
  );
}

function ReceiptReadState({
  action,
  copy,
  icon,
  label,
  title,
  tone = "default",
}: Readonly<{
  action?: ReactNode;
  copy: string;
  icon: ReactNode;
  label: string;
  title: string;
  tone?: "default" | "error";
}>) {
  return (
    <section
      aria-live="polite"
      className="panel settlement-receipt-state"
      data-tone={tone}
    >
      <span className="settlement-receipt-state__icon">{icon}</span>
      <div>
        <p className="eyebrow">{label}</p>
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
      {action ? <div className="settlement-receipt-state__action">{action}</div> : null}
    </section>
  );
}

function workflowDetailHref(
  slug: string,
  workflow: DecodedMergePayWorkflow,
): string {
  const query = new URLSearchParams({
    account: workflow.address,
    sponsor: workflow.state.sponsor,
  });
  return `${routes.bounty(slug)}?${query.toString()}`;
}
