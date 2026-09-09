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
import { formatRlo, shortenAddress } from "@/lib/format";
import { requestWalletControlOpen } from "@/lib/wallet-control-events";
import { routes } from "@/lib/constants";

const SETTLEMENT_PAGE_SIZE = 6;
const SETTLEMENT_REFRESH_INTERVAL_MS = 10_000;

type SettlementState = {
  status: "idle" | "loading" | "ready" | "error";
  page: MergePaySettlementPage | null;
  error: Error | null;
  pageIndex: number;
  lastChecked: number | null;
};

const initialState: SettlementState = {
  status: "idle",
  page: null,
  error: null,
  pageIndex: 0,
  lastChecked: null,
};

export function SettlementActivityFeed() {
  const wallet = useWallet();
  const network = useNetwork();
  const [state, setState] = useState<SettlementState>(initialState);
  const requestRef = useRef(0);
  const stateRef = useRef(state);
  const pageCursorsRef = useRef<Array<string | undefined>>([undefined]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const loadSettlements = useCallback(
    async ({
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
      setState((current) => ({
        ...current,
        status: "loading",
        page: clearItems ? null : current.page,
        error: null,
      }));

      try {
        const page = await network.client.getWalletSettlementPage(wallet.address, {
          limit: SETTLEMENT_PAGE_SIZE,
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
          page,
          error: null,
          pageIndex,
          lastChecked: Date.now(),
        });
      } catch (cause) {
        if (requestId !== requestRef.current) return;
        setState({
          status: "error",
          page: null,
          error: cause instanceof Error ? cause : new Error(String(cause)),
          pageIndex,
          lastChecked: null,
        });
      }
    },
    [network.client, network.rpcStatus, wallet.address],
  );

  useEffect(() => {
    requestRef.current += 1;
    pageCursorsRef.current = [undefined];

    const timer = window.setTimeout(() => {
      if (!wallet.address || network.rpcStatus !== "available") {
        setState(initialState);
        return;
      }
      void loadSettlements({ clearItems: true, pageIndex: 0 });
    }, 0);

    return () => {
      window.clearTimeout(timer);
      requestRef.current += 1;
    };
  }, [loadSettlements, network.rpcStatus, wallet.address]);

  useEffect(() => {
    if (!wallet.address || network.rpcStatus !== "available") return;

    const refreshLatest = () => {
      if (
        document.visibilityState === "visible" &&
        stateRef.current.pageIndex === 0
      ) {
        void loadSettlements({ clearItems: false, pageIndex: 0 });
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
    pageCursorsRef.current = [undefined];
    void loadSettlements({ clearItems: true, pageIndex: 0 });
  }

  function showPreviousPage() {
    if (state.pageIndex === 0 || state.status === "loading") return;
    const pageIndex = state.pageIndex - 1;
    const before = pageCursorsRef.current[pageIndex];
    void loadSettlements({ ...(before ? { before } : {}), pageIndex });
  }

  function showNextPage() {
    const page = state.page;
    if (!page?.hasMore || !page.nextBefore || state.status === "loading") return;
    const pageIndex = state.pageIndex + 1;
    pageCursorsRef.current[pageIndex] = page.nextBefore;
    void loadSettlements({ before: page.nextBefore, pageIndex });
  }

  const sourceLabel = wallet.source === "embedded"
    ? "Embedded DevNet wallet"
    : wallet.walletName ?? "Connected wallet";
  const page = state.page;
  const items = page?.items ?? [];

  return (
    <section
      aria-busy={state.status === "loading"}
      aria-labelledby="settlement-activity-title"
      className="settlement-activity"
    >
      <header className="settlement-activity__header">
        <div>
          <p className="panel-label">TERMINAL OUTCOMES ONLY</p>
          <h2 id="settlement-activity-title">Your settlement history</h2>
          <p>
            Paid and refunded bounties involving this wallet. The page checks
            the workflow account again on every refresh and watches for new
            results automatically.
          </p>
        </div>
        <div className="settlement-activity__header-actions">
          <span className="settlement-live-indicator">
            <i aria-hidden="true" /> Live watch
          </span>
          <button
            aria-label="Refresh settlement history"
            className="activity-refresh"
            data-loading={state.status === "loading"}
            disabled={
              !wallet.address ||
              network.rpcStatus !== "available" ||
              state.status === "loading"
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

      {!wallet.address ? (
        <SettlementEmptyState
          details={["Paid to the contributor", "Refunded to the sponsor"]}
          eyebrow="WALLET REQUIRED"
          icon={<WalletCards aria-hidden="true" size={20} strokeWidth={1.7} />}
          title="Connect a wallet to see settlements"
          description="Open the wallet control in the header. Once connected, this page will find paid and refunded bounties associated with that address."
          action={<button className="button button--dark" onClick={requestWalletControlOpen} type="button">Open wallet</button>}
        />
      ) : network.rpcStatus !== "available" ? (
        <SettlementEmptyState
          details={["Wallet connection preserved", "No placeholder outcomes"]}
          eyebrow="CONNECTION PENDING"
          icon={<CircleDashed aria-hidden="true" size={20} strokeWidth={1.7} />}
          title="Waiting for Rialo DevNet"
          description="The wallet is connected, but the RPC has not reported a healthy response yet. Settlement history will appear when the live connection is ready."
          action={<button className="button button--dark" onClick={network.refreshRpcHealth} type="button">Check connection</button>}
        />
      ) : state.status === "loading" && !page ? (
        <SettlementLoadingState />
      ) : state.status === "error" ? (
        <SettlementEmptyState
          details={["Workflow state is re-read", "Retry keeps the wallet scope"]}
          eyebrow="READ INTERRUPTED"
          icon={<AlertCircle aria-hidden="true" size={20} strokeWidth={1.7} />}
          title="Settlement history could not be read"
          description={state.error?.message || "Rialo did not return a usable settlement response."}
          action={<button className="button button--dark" onClick={refreshSettlements} type="button">Try again</button>}
          tone="error"
        />
      ) : items.length === 0 ? (
        <SettlementEmptyState
          details={["Only paid outcomes", "Only refunded outcomes"]}
          eyebrow="NO TERMINAL OUTCOMES"
          icon={<Clock3 aria-hidden="true" size={20} strokeWidth={1.7} />}
          title="Nothing paid or refunded yet"
          description="This page intentionally hides funding, claims, and failed attempts. A bounty appears here only after its workflow reaches a verified paid or refunded state."
          action={<Link className="button button--dark" href={routes.activity}>View all activity</Link>}
        />
      ) : (
        <>
          <div className="settlement-activity__summary">
            <div>
              <span className="panel-label">VERIFIED ONCHAIN</span>
              <strong>{items.length} {items.length === 1 ? "settlement" : "settlements"}</strong>
              <small>{state.lastChecked ? `Checked ${formatCheckedTime(state.lastChecked)}` : "Checking now"}</small>
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
            loading={state.status === "loading"}
            onNext={showNextPage}
            onPrevious={showPreviousPage}
            pageIndex={state.pageIndex}
          />
        </>
      )}

      <footer className="settlement-activity__note">
        <ReceiptText aria-hidden="true" size={16} strokeWidth={1.7} />
        <p>
          The contributor can see the same terminal result after a claim, even
          when the sponsor is the wallet that initiated the refund. No page
          reload is required while this page is visible.
        </p>
      </footer>
    </section>
  );
}

function SettlementRow({ item }: Readonly<{ item: MergePaySettlementItem }>) {
  const paid = item.outcome === "paid";
  const stateFlag = paid ? "paid = true" : "refunded = true";
  const time = formatSettlementTime(item.blockTime);
  const receiptHref = item.workflowSlug
    ? `${routes.settlementReceipt(item.workflowSlug)}?account=${encodeURIComponent(item.workflowAddress)}&sponsor=${encodeURIComponent(item.workflow.state.sponsor)}`
    : null;
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
        {receiptHref ? (
          <Link className="settlement-receipt-link" href={receiptHref}>
            <ReceiptText aria-hidden="true" size={14} strokeWidth={1.7} />
            Verify receipt
          </Link>
        ) : (
          <span className="settlement-workflow-address" title={item.workflowAddress}>
            Workflow {shortenAddress(item.workflowAddress, 6)}
          </span>
        )}
        <CopyValue value={item.signature} />
      </div>
    </article>
  );
}

function SettlementPagination({
  count,
  hasNext,
  loading,
  onNext,
  onPrevious,
  pageIndex,
}: Readonly<{
  count: number;
  hasNext: boolean;
  loading: boolean;
  onNext: () => void;
  onPrevious: () => void;
  pageIndex: number;
}>) {
  const pageNumber = pageIndex + 1;

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
        <small>{count} shown · newest first</small>
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
      <div className="settlement-activity__empty-copy">
        <span>{eyebrow}</span>
        <h3>{title}</h3>
        <p>{description}</p>
        <div>{action}</div>
      </div>
      <div className="settlement-activity__empty-details">
        <span>THIS PAGE SHOWS</span>
        <ul>
          {details.map((detail) => <li key={detail}>{detail}</li>)}
        </ul>
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
