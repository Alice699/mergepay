"use client";

import type {
  MergePaySettlementItem,
  MergePaySettlementPage,
} from "@mergepay/rialo-client";
import {
  AlertCircle,
  Check,
  CircleDashed,
  Clock3,
  GitPullRequest,
  ReceiptText,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CopyValue } from "@/components/ui/copy-value";
import { useNetwork } from "@/hooks/use-network";
import { useWallet } from "@/hooks/use-wallet";
import { formatRlo } from "@/lib/format";
import { requestWalletControlOpen } from "@/lib/wallet-control-events";
import { routes } from "@/lib/constants";
import { TransactionProof } from "@/components/ui/transaction-proof";

const SETTLEMENT_PAGE_SIZE = 6;
const SETTLEMENT_REFRESH_INTERVAL_MS = 45_000;
const SETTLEMENT_REFRESH_MIN_GAP_MS = 15_000;

type SettlementLoadMode = "initial" | "page" | "refresh";

type SettlementState = {
  status: "idle" | "loading" | "ready" | "error";
  page: MergePaySettlementPage | null;
  error: Error | null;
  pageIndex: number;
  lastChecked: number | null;
  refreshing: boolean;
};

const initialState: SettlementState = {
  status: "idle",
  page: null,
  error: null,
  pageIndex: 0,
  lastChecked: null,
  refreshing: false,
};

function isSettlementBusy(state: SettlementState): boolean {
  return state.status === "loading" || state.refreshing;
}

function stabilizeLatestSettlementPage(
  previous: MergePaySettlementPage,
  incoming: MergePaySettlementPage,
): MergePaySettlementPage {
  if (!incoming.incomplete) return incoming;

  const verifiedByWorkflow = new Map(
    previous.items.map((item) => [item.workflowAddress, item]),
  );
  for (const item of incoming.items) {
    verifiedByWorkflow.set(item.workflowAddress, item);
  }

  const items = [...verifiedByWorkflow.values()]
    .sort((left, right) => {
      if (left.blockHeight === right.blockHeight) return 0;
      return left.blockHeight > right.blockHeight ? -1 : 1;
    });
  const nextBefore = incoming.nextBefore ?? previous.nextBefore;

  return {
    ...incoming,
    items,
    nextBefore,
    hasMore: Boolean(nextBefore && (incoming.hasMore || previous.hasMore)),
    scannedTransactions: Math.max(
      incoming.scannedTransactions,
      previous.scannedTransactions,
    ),
  };
}

export function SettlementActivityFeed() {
  const wallet = useWallet();
  const network = useNetwork();
  const [state, setState] = useState<SettlementState>(initialState);
  const [loadingPageIndex, setLoadingPageIndex] = useState<number | null>(null);
  const requestRef = useRef(0);
  const activeRequestRef = useRef(false);
  const initializedAddressRef = useRef<string | null>(null);
  const lastRefreshStartedRef = useRef(0);
  const stateRef = useRef(state);
  const walletAddressRef = useRef(wallet.address);
  const pageCursorsRef = useRef<Array<string | undefined>>([undefined]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const loadSettlements = useCallback(
    async ({
      address,
      before,
      mode,
      pageIndex,
    }: {
      address: string;
      before?: string;
      mode: SettlementLoadMode;
      pageIndex: number;
    }) => {
      if (activeRequestRef.current || walletAddressRef.current !== address) return;

      const requestId = ++requestRef.current;
      activeRequestRef.current = true;
      lastRefreshStartedRef.current = Date.now();
      setLoadingPageIndex(mode === "page" ? pageIndex : null);
      setState((current) => ({
        ...current,
        status: mode === "refresh" && current.page ? "ready" : "loading",
        page: mode === "initial" ? null : current.page,
        error: null,
        refreshing: mode === "refresh" && current.page !== null,
      }));

      try {
        const incomingPage = await network.client.getWalletSettlementPage(address, {
          limit: SETTLEMENT_PAGE_SIZE,
          ...(before ? { before } : {}),
        });
        if (
          requestId !== requestRef.current ||
          walletAddressRef.current !== address
        ) return;

        const current = stateRef.current;
        const page = mode === "refresh" &&
          pageIndex === 0 &&
          current.pageIndex === 0 &&
          current.page
          ? stabilizeLatestSettlementPage(current.page, incomingPage)
          : incomingPage;

        if (page.hasMore && page.nextBefore) {
          pageCursorsRef.current[pageIndex + 1] = page.nextBefore;
        } else {
          pageCursorsRef.current = pageCursorsRef.current.slice(0, pageIndex + 1);
        }

        setState({
          status: "ready",
          page,
          error: null,
          pageIndex,
          lastChecked: Date.now(),
          refreshing: false,
        });
      } catch (cause) {
        if (
          requestId !== requestRef.current ||
          walletAddressRef.current !== address
        ) return;

        const error = cause instanceof Error ? cause : new Error(String(cause));
        setState((current) => current.page
          ? {
              ...current,
              status: "ready",
              error,
              refreshing: false,
            }
          : {
              status: "error",
              page: null,
              error,
              pageIndex,
              lastChecked: null,
              refreshing: false,
            });
      } finally {
        if (requestId === requestRef.current) {
          activeRequestRef.current = false;
          setLoadingPageIndex(null);
        }
      }
    },
    [network.client],
  );

  useEffect(() => {
    walletAddressRef.current = wallet.address;
    requestRef.current += 1;
    activeRequestRef.current = false;
    initializedAddressRef.current = null;
    lastRefreshStartedRef.current = 0;
    pageCursorsRef.current = [undefined];
    const timer = window.setTimeout(() => {
      setLoadingPageIndex(null);
      setState(initialState);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [wallet.address]);

  useEffect(() => {
    if (!wallet.address || network.rpcStatus !== "available") return;

    const address = wallet.address;
    const firstLoadForWallet = initializedAddressRef.current !== address;
    initializedAddressRef.current = address;

    const timer = window.setTimeout(() => {
      void loadSettlements({
        address,
        mode: firstLoadForWallet ? "initial" : "refresh",
        pageIndex: 0,
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadSettlements, network.rpcStatus, wallet.address]);

  useEffect(() => () => {
    requestRef.current += 1;
    activeRequestRef.current = false;
  }, []);

  useEffect(() => {
    if (!wallet.address || network.rpcStatus !== "available") return;
    const address = wallet.address;

    const refreshLatest = () => {
      const current = stateRef.current;
      if (
        document.visibilityState === "visible" &&
        current.pageIndex === 0 &&
        current.status !== "loading" &&
        !current.refreshing &&
        !activeRequestRef.current &&
        Date.now() - lastRefreshStartedRef.current >=
          SETTLEMENT_REFRESH_MIN_GAP_MS
      ) {
        void loadSettlements({
          address,
          mode: current.page ? "refresh" : "initial",
          pageIndex: 0,
        });
      }
    };

    const interval = window.setInterval(
      refreshLatest,
      SETTLEMENT_REFRESH_INTERVAL_MS,
    );
    window.addEventListener("focus", refreshLatest);
    document.addEventListener("visibilitychange", refreshLatest);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshLatest);
      document.removeEventListener("visibilitychange", refreshLatest);
    };
  }, [loadSettlements, network.rpcStatus, wallet.address]);

  function refreshSettlements() {
    if (!wallet.address || network.rpcStatus !== "available") return;
    pageCursorsRef.current = [undefined];
    void loadSettlements({
      address: wallet.address,
      mode: state.page && state.pageIndex === 0 ? "refresh" : state.page ? "page" : "initial",
      pageIndex: 0,
    });
  }

  function showPreviousPage() {
    if (!wallet.address || state.pageIndex === 0 || isSettlementBusy(state)) return;
    const pageIndex = state.pageIndex - 1;
    const before = pageCursorsRef.current[pageIndex];
    void loadSettlements({
      address: wallet.address,
      ...(before ? { before } : {}),
      mode: "page",
      pageIndex,
    });
  }

  function showNextPage() {
    const page = state.page;
    if (
      !wallet.address ||
      !page?.hasMore ||
      !page.nextBefore ||
      isSettlementBusy(state)
    ) return;
    const pageIndex = state.pageIndex + 1;
    pageCursorsRef.current[pageIndex] = page.nextBefore;
    void loadSettlements({
      address: wallet.address,
      before: page.nextBefore,
      mode: "page",
      pageIndex,
    });
  }

  const sourceLabel = wallet.source === "embedded"
    ? "Embedded DevNet wallet"
    : wallet.walletName ?? "Connected wallet";
  const page = state.page;
  const items = page?.items ?? [];
  const isBusy = isSettlementBusy(state);
  const syncStatus = !wallet.address
    ? "idle"
    : state.refreshing || state.status === "loading"
      ? "syncing"
      : network.rpcStatus !== "available"
        ? "offline"
        : state.error || page?.incomplete
          ? "partial"
          : "live";
  const syncLabel = syncStatus === "syncing"
    ? "Syncing"
    : syncStatus === "offline"
      ? "Connection paused"
      : syncStatus === "partial"
        ? "Partial read"
        : syncStatus === "live"
          ? "Live sync"
          : "Wallet required";
  const syncNotice = page && network.rpcStatus !== "available"
    ? {
        title: "Showing the last verified receipts",
        description: "Rialo DevNet is temporarily unavailable. Existing proof stays visible and will reconcile when the connection recovers.",
      }
    : page && state.error
      ? {
          title: "Latest sync was interrupted",
          description: "The previous verified result is preserved. Retry when the RPC connection is stable; no receipt has been removed.",
        }
      : page?.incomplete
        ? {
            title: "Some chain records need another pass",
            description: `${page.readErrors} ${page.readErrors === 1 ? "record did" : "records did"} not return a complete response. Verified receipts remain visible while the next sync reconciles the gap.`,
          }
        : null;

  return (
    <section
      aria-busy={isBusy}
      aria-labelledby="settlement-activity-title"
      className="settlement-activity"
    >
      <header className="settlement-activity__header">
        <div>
          <p className="panel-label">TERMINAL PROOF ONLY</p>
          <h2 id="settlement-activity-title">Verified settlement receipts</h2>
          <p>
            Paid and refunded bounties involving this wallet. Open any receipt
            to verify the workflow flags, destination, and terminal transaction
            without relying on a wallet balance change.
          </p>
        </div>
        <div className="settlement-activity__header-actions">
          <span className="settlement-live-indicator" data-status={syncStatus}>
            <i aria-hidden="true" /> {syncLabel}
          </span>
          <button
            aria-label="Refresh settlement history"
            className="activity-refresh"
            data-loading={isBusy}
            disabled={
              !wallet.address ||
              network.rpcStatus !== "available" ||
              isBusy
            }
            onClick={refreshSettlements}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={15} strokeWidth={1.8} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {wallet.address ? (
        <div className="settlement-activity__identity">
          <div className="settlement-activity__identity-mark" aria-hidden="true">
            <WalletCards size={18} strokeWidth={1.7} />
          </div>
          <div>
            <span>{sourceLabel}</span>
            <CopyValue value={wallet.address} />
          </div>
          <div className="settlement-activity__scope">
            <span>SHOWING</span>
            <strong><Check aria-hidden="true" size={13} /> Paid + refunded</strong>
          </div>
        </div>
      ) : null}

      {syncNotice ? (
        <div className="settlement-activity__sync-notice" role="status">
          <AlertCircle aria-hidden="true" size={16} strokeWidth={1.8} />
          <p><strong>{syncNotice.title}</strong> {syncNotice.description}</p>
        </div>
      ) : null}

      {!wallet.address ? (
        <SettlementEmptyState
          details={["Paid to the contributor", "Refunded to the sponsor"]}
          eyebrow="WALLET REQUIRED"
          icon={<WalletCards aria-hidden="true" size={20} strokeWidth={1.7} />}
          title="Connect a wallet to see settlements"
          description="Open the wallet control in the header. Once connected, this page will find paid and refunded bounties associated with that address."
          action={<button className="button button--dark" onClick={requestWalletControlOpen} type="button">Open wallet</button>}
        />
      ) : !page && network.rpcStatus !== "available" ? (
        <SettlementEmptyState
          details={["Wallet connection preserved", "No placeholder outcomes"]}
          eyebrow="CONNECTION PENDING"
          icon={<CircleDashed aria-hidden="true" size={20} strokeWidth={1.7} />}
          title="Waiting for Rialo DevNet"
          description="The wallet is connected, but the RPC has not reported a healthy response yet. Settlement history will appear when the live connection is ready."
          action={<button className="button button--dark" onClick={network.refreshRpcHealth} type="button">Check connection</button>}
        />
      ) : state.status === "loading" && items.length === 0 ? (
        <SettlementLoadingState />
      ) : state.status === "error" && !page ? (
        <SettlementEmptyState
          details={["Workflow state is re-read", "Retry keeps the wallet scope"]}
          eyebrow="READ INTERRUPTED"
          icon={<AlertCircle aria-hidden="true" size={20} strokeWidth={1.7} />}
          title="Settlement history could not be read"
          description={state.error?.message || "Rialo did not return a usable settlement response."}
          action={<button className="button button--dark" onClick={refreshSettlements} type="button">Try again</button>}
          tone="error"
        />
      ) : page?.incomplete && items.length === 0 ? (
        <SettlementEmptyState
          details={["Verified results are preserved", "Missing records are retried"]}
          eyebrow="PARTIAL CHAIN READ"
          icon={<AlertCircle aria-hidden="true" size={20} strokeWidth={1.7} />}
          title="Settlement history needs another pass"
          description="Rialo returned an incomplete response for this transaction window, so MergePay will not label it as an empty history. Retry to reconcile the missing records."
          action={<button className="button button--dark" onClick={refreshSettlements} type="button">Retry verification</button>}
          tone="error"
        />
      ) : items.length === 0 ? (
        <SettlementEmptyState
          details={["Only paid outcomes", "Only refunded outcomes"]}
          eyebrow="NO TERMINAL OUTCOMES"
          icon={<Clock3 aria-hidden="true" size={20} strokeWidth={1.7} />}
          title={page?.hasMore ? "No recent settlement found" : "Nothing paid or refunded yet"}
          description={page?.hasMore
            ? `We checked ${page.scannedTransactions} recent wallet transactions. Older activity is available if a paid or refunded bounty is further back.`
            : "This page intentionally hides funding, claims, and failed attempts. A bounty appears here only after its workflow reaches a verified paid or refunded state."}
          action={page?.hasMore
            ? <button className="button button--dark" onClick={showNextPage} type="button">Load older settlements</button>
            : <Link className="button button--dark" href={routes.activity}>View all activity</Link>}
        />
      ) : state.status === "loading" ? (
        <>
          <SettlementPageLoadingState count={Math.max(items.length, 4)} />
          <SettlementPagination
            count={items.length}
            hasNext={Boolean(page?.hasMore)}
            loading={true}
            loadingPageIndex={loadingPageIndex}
            onNext={showNextPage}
            onPrevious={showPreviousPage}
            pageIndex={state.pageIndex}
          />
        </>
      ) : (
        <>
          <div className="settlement-activity__summary">
            <div>
              <span className="panel-label">VERIFIED ONCHAIN</span>
              <strong>{items.length} {items.length === 1 ? "settlement" : "settlements"}</strong>
              <small>{state.lastChecked ? `Last verified ${formatCheckedTime(state.lastChecked)}` : "Checking now"}</small>
            </div>
            <div className="settlement-activity__legend" aria-label="Settlement outcomes">
              <span data-outcome="paid"><i aria-hidden="true" /> Paid</span>
              <span data-outcome="refunded"><i aria-hidden="true" /> Refunded</span>
            </div>
          </div>
          <div className="settlement-activity__list" aria-live="polite">
            {items.map((item) => <SettlementRow item={item} key={item.workflowAddress} />)}
          </div>
          <SettlementPagination
            count={items.length}
            hasNext={Boolean(page?.hasMore)}
            loading={isBusy}
            loadingPageIndex={loadingPageIndex}
            onNext={showNextPage}
            onPrevious={showPreviousPage}
            pageIndex={state.pageIndex}
          />
        </>
      )}

      {wallet.address ? (
        <footer className="settlement-activity__note">
          <ReceiptText aria-hidden="true" size={16} strokeWidth={1.7} />
          <p>
            Contributors can open the paid receipt, while sponsors can open the
            refund receipt. Every receipt is decoded from Rialo and links to the
            terminal transaction in Rialo Scan.
          </p>
        </footer>
      ) : null}
    </section>
  );
}

function SettlementRow({ item }: Readonly<{ item: MergePaySettlementItem }>) {
  const paid = item.outcome === "paid";
  const stateFlag = paid ? "paid = true" : "refunded = true";
  const time = formatSettlementTime(item.blockTime);
  const receiptQuery = new URLSearchParams({
    account: item.workflowAddress,
    sponsor: item.workflow.state.sponsor,
    tx: item.signature,
  });
  const receiptHref = `${item.workflowSlug
    ? routes.settlementReceipt(item.workflowSlug)
    : routes.settlementReceiptByAccount}?${receiptQuery.toString()}`;
  const source = item.action === "check_merge"
    ? "Native merge heartbeat"
    : item.action === "refund"
      ? "Deadline refund branch"
      : "Wallet-linked workflow state";
  const roleLabel = paid
    ? item.role === "beneficiary" ? "Paid to this wallet" : "Paid from this wallet"
    : item.role === "beneficiary" ? "Refunded for this wallet" : "Returned to this wallet";

  return (
    <article className="settlement-activity__row" data-outcome={item.outcome}>
      <div className="settlement-activity__mark" aria-hidden="true">
        <Check size={17} strokeWidth={2.1} />
      </div>
      <div className="settlement-activity__main">
        <div className="settlement-activity__row-heading">
          <div>
            <span className="settlement-outcome" data-outcome={item.outcome}>
              {paid ? "PAID" : "REFUNDED"}
            </span>
            <h3>{item.workflow.state.githubOwner}/{item.workflow.state.githubRepo} <span>#{item.workflow.state.pullNumber.toString()}</span></h3>
          </div>
          <strong>{formatRlo(item.workflow.state.amountKelvin)} <small>RLO</small></strong>
        </div>
        <p className="settlement-activity__role">{roleLabel}</p>
        <div className="settlement-activity__meta">
          <span><i aria-hidden="true" /> {source}</span>
          <span>{stateFlag}</span>
          <time dateTime={time.iso}>{time.label}</time>
        </div>
      </div>
      <div className="settlement-activity__actions">
        <a
          className="settlement-github-link"
          href={`https://github.com/${encodeURIComponent(item.workflow.state.githubOwner)}/${encodeURIComponent(item.workflow.state.githubRepo)}/pull/${item.workflow.state.pullNumber.toString()}`}
          rel="noreferrer"
          target="_blank"
        >
          <GitPullRequest aria-hidden="true" size={14} strokeWidth={1.7} />
          PR #{item.workflow.state.pullNumber.toString()}
        </a>
        <Link className="settlement-receipt-link" href={receiptHref}>
          <ReceiptText aria-hidden="true" size={14} strokeWidth={1.7} />
          View receipt
        </Link>
        <TransactionProof signature={item.signature} />
      </div>
    </article>
  );
}

function SettlementPagination({
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
    <nav aria-label="Settlement history pages" className="settlement-activity__pagination">
      <button
        disabled={pageIndex === 0 || loading}
        onClick={onPrevious}
        type="button"
      >
        Previous
      </button>
      <div aria-live="polite">
        <span>PAGE</span>
        <strong>{String(pageNumber).padStart(2, "0")}</strong>
        <small>{count} shown / newest first</small>
      </div>
      <button disabled={!hasNext || loading} onClick={onNext} type="button">
        Next
      </button>
    </nav>
  );
}

function SettlementEmptyState({
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
    <div className="settlement-activity__empty" data-tone={tone ?? "default"}>
      <div className="settlement-activity__empty-visual" aria-hidden="true">
        <span className="settlement-activity__empty-orbit" />
        <div className="settlement-activity__empty-icon">{icon}</div>
        <span className="settlement-activity__empty-network">DEVNET</span>
      </div>
      <div className="settlement-activity__empty-body">
        <div className="settlement-activity__empty-copy">
          <span className="settlement-activity__empty-eyebrow">{eyebrow}</span>
          <h3>{title}</h3>
          <p>{description}</p>
          <div className="settlement-activity__empty-action">{action}</div>
        </div>
        <div className="settlement-activity__empty-details">
          <span>THIS PAGE SHOWS</span>
          <ul>
            {details.map((detail) => <li key={detail}>{detail}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SettlementLoadingState() {
  return (
    <div className="settlement-activity__loading" aria-label="Reading settlement history" role="status">
      <span /><span /><span />
      <p>Checking terminal workflow states on Rialo DevNet...</p>
    </div>
  );
}

function SettlementPageLoadingState({ count }: Readonly<{ count: number }>) {
  return (
    <div className="settlement-activity__page-loading" aria-label="Loading settlement page" role="status">
      <div className="settlement-activity__list settlement-activity__list--loading" aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <div className="settlement-activity__skeleton-row" key={index}>
            <span className="settlement-activity__skeleton settlement-activity__skeleton--mark" />
            <span className="settlement-activity__skeleton settlement-activity__skeleton--main" />
            <span className="settlement-activity__skeleton settlement-activity__skeleton--actions" />
          </div>
        ))}
      </div>
      <div className="settlement-activity__page-loading-label">
        <span aria-hidden="true" />
        Loading the next settlement page...
      </div>
    </div>
  );
}

function formatSettlementTime(blockTime: bigint | null): { iso: string; label: string } {
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

function formatCheckedTime(value: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}
