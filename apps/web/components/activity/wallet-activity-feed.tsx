"use client";

import type { MergePayActivityItem, MergePayInstructionName } from "@mergepay/rialo-client";
import {
  Activity,
  AlertCircle,
  Check,
  CircleDashed,
  Clock3,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNetwork } from "@/hooks/use-network";
import { useWallet } from "@/hooks/use-wallet";
import { formatRlo, shortenAddress } from "@/lib/format";
import { requestWalletControlOpen } from "@/lib/wallet-control-events";
import { CopyValue } from "@/components/ui/copy-value";
import { TransactionProof } from "@/components/ui/transaction-proof";

const ACTIVITY_PAGE_SIZE = 8;

type ActivityState = {
  status: "idle" | "loading" | "ready" | "error";
  items: MergePayActivityItem[];
  error: Error | null;
  pageIndex: number;
  hasNext: boolean;
  nextBefore: string | null;
};

const initialActivityState: ActivityState = {
  status: "idle",
  items: [],
  error: null,
  pageIndex: 0,
  hasNext: false,
  nextBefore: null,
};

const actionLabels: Record<MergePayInstructionName | "network", string> = {
  create_bounty: "Created bounty",
  prepare_funding: "Prepared escrow storage",
  fund: "Funded escrow",
  check_merge: "Checked merge",
  refund: "Refunded escrow",
  status: "Read workflow",
  request_claim: "Requested bounty claim",
  accept_claim: "Approved contributor",
  network: "Network transaction",
};

const actionDetails: Record<MergePayInstructionName | "network", string> = {
  create_bounty: "Workflow terms committed on Rialo",
  prepare_funding: "Workflow storage stabilized before escrow funding",
  fund: "Committed RLO moved into the workflow account",
  check_merge: "GitHub merge verification requested through REX",
  refund: "Expired escrow returned to the sponsor",
  status: "Workflow state read through the MergePay program",
  request_claim: "Contributor claim record created",
  accept_claim: "Beneficiary locked by the sponsor",
  network: "Recorded for this connected address",
};

export function WalletActivityFeed() {
  const wallet = useWallet();
  const network = useNetwork();
  const [state, setState] = useState<ActivityState>(initialActivityState);
  const [loadingPageIndex, setLoadingPageIndex] = useState<number | null>(null);
  const requestRef = useRef(0);
  const pageCursorsRef = useRef<Array<string | undefined>>([undefined]);

  const loadActivityPage = useCallback(async ({
    before,
    clearItems = false,
    pageIndex,
  }: {
    before?: string;
    clearItems?: boolean;
    pageIndex: number;
  }) => {
    if (!wallet.address || network.rpcStatus !== "available") return;

    const requestId = ++requestRef.current;
    setLoadingPageIndex(pageIndex);
    setState((current) => ({
      ...current,
      status: "loading",
      items: clearItems ? [] : current.items,
      error: null,
    }));

    try {
      const page = await network.client.getWalletActivityPage(wallet.address, {
        limit: ACTIVITY_PAGE_SIZE,
        ...(before ? { before } : {}),
      });
      if (requestId !== requestRef.current) return;

      if (page.hasMore && page.nextBefore) {
        pageCursorsRef.current[pageIndex + 1] = page.nextBefore;
      } else {
        pageCursorsRef.current = pageCursorsRef.current.slice(0, pageIndex + 1);
      }

      setState({
        status: "ready",
        items: page.items,
        error: null,
        pageIndex,
        hasNext: page.hasMore,
        nextBefore: page.nextBefore,
      });
      setLoadingPageIndex(null);
    } catch (cause) {
      if (requestId !== requestRef.current) return;
      setState({
        status: "error",
        items: [],
        error: cause instanceof Error ? cause : new Error(String(cause)),
        pageIndex,
        hasNext: false,
        nextBefore: null,
      });
      setLoadingPageIndex(null);
    }
  }, [network.client, network.rpcStatus, wallet.address]);

  useEffect(() => {
    requestRef.current += 1;
    pageCursorsRef.current = [undefined];

    const timer = window.setTimeout(() => {
      if (!wallet.address || network.rpcStatus !== "available") {
        setLoadingPageIndex(null);
        setState(initialActivityState);
        return;
      }
      void loadActivityPage({ clearItems: true, pageIndex: 0 });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      requestRef.current += 1;
    };
  }, [loadActivityPage, network.rpcStatus, wallet.address]);

  function refreshActivity() {
    pageCursorsRef.current = [undefined];
    void loadActivityPage({ pageIndex: 0 });
  }

  function showPreviousPage() {
    if (state.pageIndex === 0 || state.status === "loading") return;
    const pageIndex = state.pageIndex - 1;
    const before = pageCursorsRef.current[pageIndex];
    void loadActivityPage({
      ...(before ? { before } : {}),
      pageIndex,
    });
  }

  function showNextPage() {
    if (!state.hasNext || !state.nextBefore || state.status === "loading") return;
    const pageIndex = state.pageIndex + 1;
    pageCursorsRef.current[pageIndex] = state.nextBefore;
    void loadActivityPage({ before: state.nextBefore, pageIndex });
  }

  const sourceLabel = wallet.source === "embedded"
    ? "Embedded DevNet wallet"
    : wallet.walletName ?? "Connected wallet";

  return (
    <section
      aria-busy={state.status === "loading"}
      aria-labelledby="wallet-activity-title"
      className="wallet-activity"
    >
      <div className="wallet-activity__header">
        <div>
          <p className="panel-label">CONNECTED WALLET</p>
          <h2 id="wallet-activity-title">Your activity</h2>
          <p>Only transactions involving the active wallet are shown here. Records are newest first and older history is loaded from Rialo DevNet by page.</p>
        </div>
        <button
          aria-label="Refresh wallet activity"
          className="activity-refresh"
          data-loading={state.status === "loading"}
          disabled={!wallet.address || network.rpcStatus !== "available" || state.status === "loading"}
          onClick={refreshActivity}
          title="Refresh activity"
          type="button"
        >
          <RefreshCw aria-hidden="true" size={15} strokeWidth={1.8} />
          <span>Refresh</span>
        </button>
      </div>

      {wallet.address ? (
        <div className="wallet-activity__identity">
          <div className="wallet-activity__identity-mark" aria-hidden="true"><WalletCards size={18} strokeWidth={1.7} /></div>
          <div>
            <span>{sourceLabel}</span>
            <CopyValue value={wallet.address} />
          </div>
          <div className="wallet-activity__balance">
            <span>AVAILABLE BALANCE</span>
            <strong>{wallet.balance.formatted ? `${wallet.balance.formatted} RLO` : "Unavailable"}</strong>
          </div>
        </div>
      ) : null}

      {!wallet.address ? (
        <ActivityEmptyState
          details={["Confirmed and failed actions", "Exact onchain signatures"]}
          eyebrow="WALLET REQUIRED"
          icon={<WalletCards aria-hidden="true" size={20} strokeWidth={1.7} />}
          title="Connect a wallet to see activity"
          description="Open the wallet control in the header and connect an extension or unlock the embedded DevNet wallet."
          action={<button className="button button--dark" onClick={requestWalletControlOpen} type="button">Open wallet</button>}
        />
      ) : network.rpcStatus !== "available" ? (
        <ActivityEmptyState
          details={["Wallet connection preserved", "No placeholder data substituted"]}
          eyebrow="CONNECTION PENDING"
          icon={<CircleDashed aria-hidden="true" size={20} strokeWidth={1.7} />}
          title="Waiting for Rialo DevNet"
          description="The connected address is ready, but the RPC has not reported a healthy response yet. Activity will appear when the connection is available."
          action={<button className="button button--dark" onClick={network.refreshRpcHealth} type="button">Check connection</button>}
        />
      ) : state.status === "loading" && state.items.length === 0 ? (
        <ActivityLoadingState />
      ) : state.status === "error" ? (
        <ActivityEmptyState
          details={["Wallet remains connected", "Retry only re-reads DevNet"]}
          eyebrow="READ INTERRUPTED"
          icon={<AlertCircle aria-hidden="true" size={20} strokeWidth={1.7} />}
          title="Activity could not be read"
          description={state.error?.message || "Rialo did not return a usable activity response."}
          action={<button className="button button--dark" onClick={refreshActivity} type="button">Try again</button>}
          tone="error"
        />
      ) : state.items.length === 0 ? (
        <ActivityEmptyState
          details={["No sample records", "New actions appear after confirmation"]}
          eyebrow="NO RECORDS YET"
          icon={<Clock3 aria-hidden="true" size={20} strokeWidth={1.7} />}
          title="No activity for this wallet yet"
          description="Create or fund a workflow to make the first real MergePay transaction appear in this feed."
          action={<Link className="button button--dark" href="/bounties/new">Create a bounty</Link>}
        />
      ) : state.status === "loading" ? (
        <>
          <ActivityPageLoadingState count={Math.max(state.items.length, 4)} />
          <ActivityPagination
            count={state.items.length}
            hasNext={state.hasNext}
            loading={true}
            loadingPageIndex={loadingPageIndex}
            onNext={showNextPage}
            onPrevious={showPreviousPage}
            pageIndex={state.pageIndex}
          />
        </>
      ) : (
        <>
          <div className="wallet-activity__list" aria-live="polite">
            <div className="wallet-activity__list-header">
              <span>ACTIVITY</span>
              <span>STATUS</span>
              <span>TRANSACTION</span>
            </div>
            {state.items.map((item) => <ActivityRow item={item} key={item.signature} />)}
          </div>
          <ActivityPagination
            count={state.items.length}
            hasNext={state.hasNext}
            loading={false}
            loadingPageIndex={loadingPageIndex}
            onNext={showNextPage}
            onPrevious={showPreviousPage}
            pageIndex={state.pageIndex}
          />
        </>
      )}

      <div className="wallet-activity__note">
        <Activity aria-hidden="true" size={16} strokeWidth={1.7} />
        <p>Activity is wallet-scoped and read-only. It does not replace the verified workflow record or invent a status when Rialo has not returned transaction details.</p>
      </div>
    </section>
  );
}

function ActivityRow({ item }: Readonly<{ item: MergePayActivityItem }>) {
  const failed = item.status === "failed";
  const actionLabel = actionLabels[item.action];
  const time = formatActivityTime(item.blockTime);

  return (
    <article className="wallet-activity__row" data-status={failed ? "failed" : "confirmed"}>
      <div className="wallet-activity__action">
        <span className="wallet-activity__status-mark" aria-hidden="true">
          {failed ? <AlertCircle size={16} strokeWidth={1.8} /> : <Check size={16} strokeWidth={2} />}
        </span>
        <div>
          <h3>{actionLabel}</h3>
          <p>{actionDetails[item.action]}</p>
          <time dateTime={time.iso}>{time.label}</time>
        </div>
      </div>
      <div className="wallet-activity__result">
        <span className={`state ${failed ? "state--bad" : "state--good"}`}>{failed ? "Failed" : "Confirmed"}</span>
        <small>{item.error ?? (item.feeKelvin === null ? "Execution recorded" : `Fee ${formatRlo(item.feeKelvin)} RLO`)}</small>
      </div>
      <div className="wallet-activity__transaction">
        <TransactionProof signature={item.signature} />
        {item.workflowAddress ? <small title={item.workflowAddress}>Workflow {shortenAddress(item.workflowAddress, 6)}</small> : null}
      </div>
    </article>
  );
}

function ActivityLoadingState() {
  return (
    <div className="wallet-activity__loading" aria-label="Reading wallet activity" role="status">
      <span /><span /><span />
      <p>Reading recent transactions from Rialo DevNet…</p>
    </div>
  );
}

function ActivityPageLoadingState({ count }: Readonly<{ count: number }>) {
  return (
    <div className="wallet-activity__page-loading" aria-label="Loading activity page" role="status">
      <div className="wallet-activity__list wallet-activity__list--loading" aria-hidden="true">
        <div className="wallet-activity__list-header">
          <span>ACTIVITY</span>
          <span>STATUS</span>
          <span>TRANSACTION</span>
        </div>
        {Array.from({ length: count }, (_, index) => (
          <div className="wallet-activity__skeleton-row" key={index}>
            <span className="wallet-activity__skeleton wallet-activity__skeleton--action" />
            <span className="wallet-activity__skeleton wallet-activity__skeleton--result" />
            <span className="wallet-activity__skeleton wallet-activity__skeleton--transaction" />
          </div>
        ))}
      </div>
      <div className="wallet-activity__page-loading-label">
        <span aria-hidden="true" />
        Loading the next activity page…
      </div>
    </div>
  );
}

function ActivityEmptyState({
  action,
  description,
  details,
  eyebrow,
  icon,
  title,
  tone,
}: Readonly<{
  action: ReactNode;
  description: string;
  details: readonly [string, string];
  eyebrow: string;
  icon: ReactNode;
  title: string;
  tone?: "error";
}>) {
  return (
    <div className="wallet-activity__empty" data-tone={tone ?? "default"}>
      <div className="wallet-activity__empty-visual" aria-hidden="true">
        <span className="wallet-activity__empty-orbit" />
        <div className="wallet-activity__empty-icon">{icon}</div>
        <span className="wallet-activity__empty-network">DEVNET</span>
      </div>
      <div className="wallet-activity__empty-copy">
        <span className="wallet-activity__empty-eyebrow">{eyebrow}</span>
        <h3>{title}</h3>
        <p>{description}</p>
        <div className="wallet-activity__empty-action">{action}</div>
      </div>
      <div className="wallet-activity__empty-details">
        <span>THIS FEED SHOWS</span>
        <ul>
          {details.map((detail) => <li key={detail}>{detail}</li>)}
        </ul>
      </div>
    </div>
  );
}

function ActivityPagination({
  count,
  hasNext,
  loading,
  loadingPageIndex,
  onNext,
  onPrevious,
  pageIndex,
}: Readonly<{
  count: number;
  hasNext: boolean;
  loading: boolean;
  loadingPageIndex: number | null;
  onNext: () => void;
  onPrevious: () => void;
  pageIndex: number;
}>) {
  const pageNumber = (loadingPageIndex ?? pageIndex) + 1;
  return (
    <nav aria-label="Wallet activity pages" className="wallet-activity__pagination">
      <button
        aria-label={pageIndex === 0 ? "No previous activity page" : `Go to activity page ${pageNumber - 1}`}
        disabled={pageIndex === 0 || loading}
        onClick={onPrevious}
        type="button"
      >
        Previous
      </button>
      <div aria-live="polite" className="wallet-activity__page-status">
        <span>PAGE</span>
        <strong>{String(pageNumber).padStart(2, "0")}</strong>
        <small>{count} {count === 1 ? "transaction" : "transactions"} · newest first</small>
      </div>
      <button
        aria-label={`Go to activity page ${pageNumber + 1}`}
        disabled={!hasNext || loading}
        onClick={onNext}
        type="button"
      >
        Next
      </button>
    </nav>
  );
}

function formatActivityTime(blockTime: bigint | null): { iso: string; label: string } {
  if (blockTime === null) return { iso: "", label: "Time unavailable" };
  const numeric = Number(blockTime);
  if (!Number.isFinite(numeric)) return { iso: "", label: "Time unavailable" };
  const timestamp = numeric > 100_000_000_000 ? numeric : numeric * 1_000;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return { iso: "", label: "Time unavailable" };
  return {
    iso: date.toISOString(),
    label: new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      timeZone: "UTC",
      year: "numeric",
    }).format(date),
  };
}
