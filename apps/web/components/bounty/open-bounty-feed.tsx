"use client";

import type {
  MergePayPublicBounty,
  MergePayPublicBountyStatus,
} from "@mergepay/rialo-client";
import { AlertCircle, Clock3, GitPullRequest, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNetwork } from "@/hooks/use-network";
import { useWallet } from "@/hooks/use-wallet";
import { routes } from "@/lib/constants";
import { formatDeadlineDate, formatRlo, shortenAddress } from "@/lib/format";
import { WorkflowLookup } from "@/components/bounty/workflow-lookup";

const BOUNTY_PAGE_SIZE = 25;

const statusLabels: Record<MergePayPublicBountyStatus, string> = {
  open: "Open claim",
  claimed: "Claimed",
  funded: "Funded",
  merge_confirmed: "Merge confirmed",
};

type ScopeFilter = "all" | "mine";
type StatusFilter = "all" | MergePayPublicBountyStatus;
type DeadlineFilter = "all" | "7" | "30";

type FeedState = {
  status: "idle" | "loading" | "ready" | "error";
  items: MergePayPublicBounty[];
  error: Error | null;
  nextBefore: string | null;
  hasMore: boolean;
  scannedTransactions: number;
};

export function OpenBountyFeed() {
  const network = useNetwork();
  const wallet = useWallet();
  const [query, setQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [repositoryFilter, setRepositoryFilter] = useState("all");
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>("all");
  const [state, setState] = useState<FeedState>({
    status: "idle",
    items: [],
    error: null,
    nextBefore: null,
    hasMore: false,
    scannedTransactions: 0,
  });
  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);

  const load = useCallback(async (append = false, preserveHistory = false) => {
    if (network.rpcStatus !== "available" || loadingRef.current) return;

    const before = append ? cursorRef.current : null;
    if (append && !before) return;

    loadingRef.current = true;
    if (!append && !preserveHistory) cursorRef.current = null;
    setState((current) => ({ ...current, status: "loading", error: null }));

    try {
      const page = await network.client.getPublicBountiesPage({
        limit: BOUNTY_PAGE_SIZE,
        ...(before ? { before } : {}),
      });
      if (append || !preserveHistory) cursorRef.current = page.nextBefore;
      setState((current) => ({
        status: "ready",
        items: append || preserveHistory
          ? mergeBounties(current.items, page.items)
          : page.items,
        error: null,
        nextBefore: preserveHistory && !append
          ? current.nextBefore ?? page.nextBefore
          : page.nextBefore,
        hasMore: preserveHistory && !append
          ? current.hasMore || page.hasMore
          : page.hasMore,
        scannedTransactions: append
          ? current.scannedTransactions + page.scannedTransactions
          : preserveHistory
            ? Math.max(current.scannedTransactions, page.scannedTransactions)
            : page.scannedTransactions,
      }));
    } catch (cause) {
      const retainHistory = append || preserveHistory;
      setState((current) => ({
        status: "error",
        items: retainHistory ? current.items : [],
        error: cause instanceof Error ? cause : new Error(String(cause)),
        nextBefore: retainHistory ? current.nextBefore : null,
        hasMore: retainHistory ? current.hasMore : false,
        scannedTransactions: retainHistory ? current.scannedTransactions : 0,
      }));
    } finally {
      loadingRef.current = false;
    }
  }, [network.client, network.rpcStatus]);

  useEffect(() => {
    if (network.rpcStatus !== "available") return;
    const timer = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(false, true);
    }, 20_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void load(false, true);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [load, network.rpcStatus]);

  const repositories = useMemo(
    () =>
      Array.from(
        new Set(
          state.items.map(({ workflow }) => {
            const { githubOwner, githubRepo } = workflow.state;
            return `${githubOwner}/${githubRepo}`;
          }),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [state.items],
  );

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const now = BigInt(Date.now());
    const deadlineWindow =
      deadlineFilter === "7"
        ? 7n * 24n * 60n * 60n * 1_000n
        : deadlineFilter === "30"
          ? 30n * 24n * 60n * 60n * 1_000n
          : null;

    return state.items.filter(({ status, workflow }) => {
      const { githubOwner, githubRepo, pullNumber, sponsor, deadlineUnixMs } = workflow.state;
      const repository = `${githubOwner}/${githubRepo}`;
      const searchable = `${repository}#${pullNumber.toString()}`.toLowerCase();

      if (scopeFilter === "mine" && (!wallet.address || sponsor !== wallet.address)) return false;
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (repositoryFilter !== "all" && repository !== repositoryFilter) return false;
      if (deadlineWindow !== null && deadlineUnixMs > now + deadlineWindow) return false;
      if (normalized && !searchable.includes(normalized)) return false;
      return true;
    });
  }, [
    deadlineFilter,
    query,
    repositoryFilter,
    scopeFilter,
    state.items,
    statusFilter,
    wallet.address,
  ]);

  const hasActiveFilters =
    Boolean(query.trim()) ||
    scopeFilter !== "all" ||
    statusFilter !== "open" ||
    repositoryFilter !== "all" ||
    deadlineFilter !== "all";

  const resetFilters = () => {
    setQuery("");
    setScopeFilter("all");
    setStatusFilter("open");
    setRepositoryFilter("all");
    setDeadlineFilter("all");
  };

  return (
    <section className="panel bounty-feed" aria-labelledby="open-bounties-title">
      <div className="bounty-feed__header">
        <div>
          <p className="eyebrow">Live DevNet discovery</p>
          <h2 id="open-bounties-title">Choose a bounty. Ship the PR.</h2>
          <p>
            Browse verified GitHub bounties directly from Rialo. Choose a listing to
            claim it - no sponsor URL required. Older pages can be loaded as needed.
          </p>
        </div>
        <button
          aria-label="Refresh bounty discovery"
          className="activity-refresh"
          data-loading={state.status === "loading"}
          disabled={network.rpcStatus !== "available" || state.status === "loading"}
          onClick={() => void load()}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={15} strokeWidth={1.8} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="bounty-feed__tools">
        <label className="bounty-feed__search" htmlFor="bounty-search">
          <Search aria-hidden="true" size={15} strokeWidth={1.8} />
          <span className="sr-only">Search repository or pull request</span>
          <input
            id="bounty-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search repository or PR"
            type="search"
            value={query}
          />
        </label>
        <span className="bounty-feed__count">
          {state.status === "loading" && state.items.length === 0
            ? "Reading chain"
            : `${visibleItems.length} shown · ${state.scannedTransactions} scanned`}
        </span>
      </div>

      <div className="bounty-feed__filters" aria-label="Bounty filters">
        <label className="bounty-feed__filter">
          <span>Scope</span>
          <select
            aria-label="Filter by bounty scope"
            onChange={(event) => setScopeFilter(event.target.value as ScopeFilter)}
            value={scopeFilter}
          >
            <option value="all">All bounties</option>
            <option disabled={!wallet.address} value="mine">
              {wallet.address ? "My bounties" : "My bounties - connect wallet"}
            </option>
          </select>
        </label>
        <label className="bounty-feed__filter">
          <span>Status</span>
          <select
            aria-label="Filter by bounty status"
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            value={statusFilter}
          >
            <option value="open">Open claim</option>
            <option value="all">All active</option>
            <option value="claimed">Claimed</option>
            <option value="funded">Funded</option>
            <option value="merge_confirmed">Merge confirmed</option>
          </select>
        </label>
        <label className="bounty-feed__filter bounty-feed__filter--repository">
          <span>Repository</span>
          <select
            aria-label="Filter by repository"
            onChange={(event) => setRepositoryFilter(event.target.value)}
            value={repositoryFilter}
          >
            <option value="all">All repositories</option>
            {repositories.map((repository) => (
              <option key={repository} value={repository}>{repository}</option>
            ))}
          </select>
        </label>
        <label className="bounty-feed__filter">
          <span>Deadline</span>
          <select
            aria-label="Filter by deadline"
            onChange={(event) => setDeadlineFilter(event.target.value as DeadlineFilter)}
            value={deadlineFilter}
          >
            <option value="all">Any deadline</option>
            <option value="7">Next 7 days</option>
            <option value="30">Next 30 days</option>
          </select>
        </label>
        {hasActiveFilters ? (
          <button className="bounty-feed__clear" onClick={resetFilters} type="button">
            Clear filters
          </button>
        ) : null}
      </div>

      {network.rpcStatus !== "available" ? (
        <FeedMessage
          title="Waiting for Rialo DevNet."
          description="The marketplace only shows verified accounts after the RPC reports a healthy connection."
          icon={<Clock3 aria-hidden="true" size={19} strokeWidth={1.7} />}
          tone="default"
        />
      ) : state.status === "error" ? (
        <FeedMessage
          action={<button className="button button--dark" onClick={() => void load()} type="button">Try again</button>}
          description={state.error?.message || "Rialo did not return a usable bounty index response."}
          icon={<AlertCircle aria-hidden="true" size={19} strokeWidth={1.7} />}
          title="Bounty discovery could not be read."
          tone="error"
        />
      ) : state.status === "loading" && state.items.length === 0 ? (
        <div className="bounty-feed__loading" role="status">
          <span /><span /><span />
          <p>Reading verified bounty accounts from Rialo DevNet...</p>
        </div>
      ) : visibleItems.length === 0 ? (
        <FeedMessage
          action={(
            <div className="bounty-feed__empty-actions">
              <WorkflowLookup />
              {state.hasMore ? (
                <button className="button button--dark" onClick={() => void load(true)} type="button">
                  Load older listings
                </button>
              ) : null}
            </div>
          )}
          description={
            hasActiveFilters
              ? "No verified bounty matches the current filters. Load older history or clear the filters."
              : "No active bounty was found in the loaded DevNet history."
          }
          icon={<GitPullRequest aria-hidden="true" size={19} strokeWidth={1.7} />}
          title={hasActiveFilters ? "Nothing matched." : "The market is quiet."}
          tone="default"
        />
      ) : (
        <>
          <div className="bounty-feed__list" aria-live="polite">
            {visibleItems.map((bounty) => (
              <BountyCard bounty={bounty} key={bounty.workflow.address} />
            ))}
          </div>
          <div className="bounty-feed__pagination">
            {state.hasMore ? (
              <button
                className="button button--dark"
                disabled={state.status === "loading"}
                onClick={() => void load(true)}
                type="button"
              >
                {state.status === "loading" ? "Loading history..." : "Load older listings"}
              </button>
            ) : (
              <span className="bounty-feed__end">End of available DevNet history</span>
            )}
            <span>{state.scannedTransactions} transaction{state.scannedTransactions === 1 ? "" : "s"} scanned</span>
          </div>
        </>
      )}

      <div className="bounty-feed__note">
        <span className="state state--warn">Shared DevNet test bounty</span>
        <p>
          Listings are live on the shared Rialo DevNet. Invalid PDA links and legacy
          ABI records are excluded; each visible card is decoded from a verified
          workflow account.
        </p>
      </div>
    </section>
  );
}

function mergeBounties(
  current: MergePayPublicBounty[],
  incoming: MergePayPublicBounty[],
): MergePayPublicBounty[] {
  const byAddress = new Map(current.map((bounty) => [bounty.workflow.address, bounty]));
  for (const bounty of incoming) byAddress.set(bounty.workflow.address, bounty);
  return Array.from(byAddress.values()).sort((left, right) =>
    left.blockHeight < right.blockHeight ? 1 : -1,
  );
}

function BountyCard({ bounty }: Readonly<{ bounty: MergePayPublicBounty }>) {
  const { state } = bounty.workflow;
  const href = `${routes.bounty(bounty.workflowSlug)}?sponsor=${encodeURIComponent(state.sponsor)}&account=${encodeURIComponent(bounty.workflow.address)}`;

  return (
    <article className="bounty-card">
      <div className="bounty-card__main">
        <div className="bounty-card__title-row">
          <span className="bounty-card__mark" aria-hidden="true"><GitPullRequest size={16} strokeWidth={1.8} /></span>
          <div>
            <p className="panel-label">{statusLabels[bounty.status]}</p>
            <h3>{state.githubOwner}/{state.githubRepo}</h3>
          </div>
        </div>
        <p className="bounty-card__origin">Shared DevNet test bounty</p>
        <p className="bounty-card__pr">Pull request #{state.pullNumber.toString()}</p>
        <div className="bounty-card__meta">
          <span>Sponsored by <strong title={state.sponsor}>{shortenAddress(state.sponsor, 5)}</strong></span>
          <span>Deadline <strong suppressHydrationWarning>{formatDeadlineDate(state.deadlineUnixMs)}</strong></span>
        </div>
      </div>
      <div className="bounty-card__reward">
        <span className="panel-label">REWARD</span>
        <strong>{formatRlo(state.amountKelvin)} <small>RLO</small></strong>
        <Link className="button button--dark" href={href}>View bounty</Link>
      </div>
    </article>
  );
}

function FeedMessage({
  action,
  description,
  icon,
  title,
  tone,
}: Readonly<{
  action?: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
  tone: "default" | "error";
}>) {
  return (
    <div className="bounty-feed__message" data-tone={tone}>
      <div className="bounty-feed__message-icon">{icon}</div>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
        {action}
      </div>
    </div>
  );
}
