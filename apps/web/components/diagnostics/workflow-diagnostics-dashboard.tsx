"use client";

import type {
  MergePayDiagnosticSeverity,
  MergePayWorkflowDiagnostic,
  MergePayWorkflowLifecycle,
} from "@mergepay/rialo-client";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  GitBranch,
  RefreshCw,
  Search,
  ShieldAlert,
  Waypoints,
} from "lucide-react";
import Link from "next/link";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CopyValue } from "@/components/ui/copy-value";
import { TransactionProof } from "@/components/ui/transaction-proof";
import { useAdaptivePolling } from "@/hooks/use-adaptive-polling";
import { useNetwork } from "@/hooks/use-network";
import { routes } from "@/lib/constants";
import { formatLocalDateTime, formatLocalTime, formatRlo } from "@/lib/format";
import { getRialoScanSearchUrl } from "@/lib/rialo-scan";

const DIAGNOSTIC_PAGE_SIZE = 25;
const DIAGNOSTIC_REFRESH_INTERVAL_MS = 30_000;

type DashboardState = {
  status: "idle" | "loading" | "ready" | "error";
  items: MergePayWorkflowDiagnostic[];
  error: Error | null;
  nextBefore: string | null;
  hasMore: boolean;
  scannedTransactions: number;
  readErrors: number;
  lastChecked: number | null;
  refreshing: boolean;
};

type LifecycleFilter =
  | "all"
  | MergePayWorkflowLifecycle
  | "unavailable";
type AgeFilter = "all" | "hour" | "day" | "older" | "overdue";
type ErrorFilter =
  | "all"
  | "attention"
  | "read"
  | "transaction"
  | "rex"
  | "clear";

const initialState: DashboardState = {
  status: "idle",
  items: [],
  error: null,
  nextBefore: null,
  hasMore: false,
  scannedTransactions: 0,
  readErrors: 0,
  lastChecked: null,
  refreshing: false,
};

const severityRank: Record<MergePayDiagnosticSeverity, number> = {
  critical: 0,
  warning: 1,
  notice: 2,
  healthy: 3,
};

const lifecycleLabels: Record<
  MergePayWorkflowLifecycle | "unavailable",
  string
> = {
  uninitialized: "Uninitialized",
  claim_request: "Claim record",
  created: "Created",
  claimed: "Claimed",
  funded: "Funded",
  merge_confirmed: "Merge confirmed",
  paid: "Paid",
  refunded: "Refunded",
  invalid: "Invalid",
  unavailable: "Unavailable",
};

const findingLabels = {
  none: "No finding",
  account_unavailable: "Account unavailable",
  read_incomplete: "Account read incomplete",
  pda_mismatch: "PDA mismatch",
  invalid_state: "Invalid account state",
  transaction_failed: "Latest transaction failed",
  rex_inconclusive: "REX response inconclusive",
  rex_failures_repeated: "Repeated REX failures",
  refund_overdue: "Refund overdue",
  settlement_incomplete: "Settlement incomplete",
  check_needs_review: "Merge check needs review",
  expired_unfunded: "Expired without funding",
} as const;

export function WorkflowDiagnosticsDashboard() {
  const network = useNetwork();
  const [state, setState] = useState<DashboardState>(initialState);
  const [query, setQuery] = useState("");
  const [lifecycleFilter, setLifecycleFilter] =
    useState<LifecycleFilter>("all");
  const [ageFilter, setAgeFilter] = useState<AgeFilter>("all");
  const [networkFilter, setNetworkFilter] = useState("all");
  const [errorFilter, setErrorFilter] = useState<ErrorFilter>("all");
  const cursorRef = useRef<string | null>(null);
  const activeRequestRef = useRef(false);

  const loadDiagnostics = useCallback(async ({
    append = false,
    preserve = false,
  }: {
    append?: boolean;
    preserve?: boolean;
  } = {}) => {
    if (network.rpcStatus !== "available" || activeRequestRef.current) {
      return true;
    }
    const before = append ? cursorRef.current : null;
    if (append && !before) return true;

    activeRequestRef.current = true;
    setState((current) => ({
      ...current,
      status: current.items.length > 0 ? "ready" : "loading",
      error: null,
      refreshing: current.items.length > 0,
    }));

    try {
      const page = await network.client.getWorkflowDiagnosticsPage({
        limit: DIAGNOSTIC_PAGE_SIZE,
        ...(before ? { before } : {}),
      });
      if (!preserve || append) cursorRef.current = page.nextBefore;
      setState((current) => {
        const keepExisting = append || preserve;
        const items = keepExisting
          ? mergeDiagnostics(current.items, page.items)
          : page.items;
        const keepHistoryCursor = preserve && !append;
        return {
          status: "ready",
          items,
          error: null,
          nextBefore: keepHistoryCursor
            ? current.nextBefore ?? page.nextBefore
            : page.nextBefore,
          hasMore: keepHistoryCursor
            ? current.hasMore || page.hasMore
            : page.hasMore,
          scannedTransactions: append
            ? current.scannedTransactions + page.scannedTransactions
            : preserve
              ? Math.max(current.scannedTransactions, page.scannedTransactions)
              : page.scannedTransactions,
          readErrors: append
            ? current.readErrors + page.readErrors
            : page.readErrors,
          lastChecked: Date.now(),
          refreshing: false,
        };
      });
      return !page.incomplete;
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      setState((current) => ({
        ...current,
        status: current.items.length > 0 ? "ready" : "error",
        error,
        refreshing: false,
      }));
      return false;
    } finally {
      activeRequestRef.current = false;
    }
  }, [network.client, network.rpcStatus]);

  useEffect(() => {
    if (network.rpcStatus !== "available") return;
    const timer = window.setTimeout(() => void loadDiagnostics(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDiagnostics, network.rpcStatus]);

  useAdaptivePolling({
    enabled: network.rpcStatus === "available",
    intervalMs: DIAGNOSTIC_REFRESH_INTERVAL_MS,
    maxIntervalMs: DIAGNOSTIC_REFRESH_INTERVAL_MS * 4,
    poll: () => loadDiagnostics({ preserve: true }),
  });

  const diagnosticReferenceTime = state.lastChecked ?? 0;
  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const now = diagnosticReferenceTime;
    return state.items
      .filter((item) => {
        const workflowState = item.workflow?.state;
        const repository = workflowState
          ? `${workflowState.githubOwner}/${workflowState.githubRepo}`
          : "";
        const searchable = [
          repository,
          workflowState?.pullNumber.toString() ?? "",
          item.workflowAddress,
          item.sponsor,
          item.latestActivity?.signature ?? "",
          item.reliability.latestRexSignal ?? "",
          item.message,
        ].join(" ").toLowerCase();
        const createdAt = blockTimeToMs(item.createdBlockTime);
        const age = createdAt === null ? null : Math.max(0, now - createdAt);
        const isOverdue = Boolean(
          workflowState &&
            !workflowState.paid &&
            !workflowState.refunded &&
            workflowState.deadlineUnixMs <= BigInt(now),
        );
        const hasAttention =
          item.severity === "critical" || item.severity === "warning";

        if (normalized && !searchable.includes(normalized)) return false;
        if (lifecycleFilter !== "all" && item.lifecycle !== lifecycleFilter) {
          return false;
        }
        if (networkFilter !== "all" && item.network !== networkFilter) {
          return false;
        }
        if (ageFilter === "hour" && (age === null || age >= 3_600_000)) {
          return false;
        }
        if (
          ageFilter === "day" &&
          (age === null || age < 3_600_000 || age >= 86_400_000)
        ) {
          return false;
        }
        if (ageFilter === "older" && (age === null || age < 86_400_000)) {
          return false;
        }
        if (ageFilter === "overdue" && !isOverdue) return false;
        if (errorFilter === "attention" && !hasAttention) return false;
        if (errorFilter === "read" && !item.readError) return false;
        if (
          errorFilter === "transaction" &&
          item.finding !== "transaction_failed"
        ) return false;
        if (
          errorFilter === "rex" &&
          item.reliability.inconclusiveRexReports === 0
        ) return false;
        if (
          errorFilter === "clear" &&
          (hasAttention || item.readError !== null)
        ) return false;
        return true;
      })
      .sort((left, right) => {
        const severityDifference =
          severityRank[left.severity] - severityRank[right.severity];
        if (severityDifference !== 0) return severityDifference;
        return left.createdBlockHeight < right.createdBlockHeight ? 1 : -1;
      });
  }, [
    ageFilter,
    errorFilter,
    lifecycleFilter,
    networkFilter,
    query,
    diagnosticReferenceTime,
    state.items,
  ]);

  const summary = useMemo(() => ({
    attention: state.items.filter(
      ({ severity }) => severity === "critical" || severity === "warning",
    ).length,
    funded: state.items.filter(({ lifecycle }) => lifecycle === "funded").length,
    terminal: state.items.filter(
      ({ lifecycle }) => lifecycle === "paid" || lifecycle === "refunded",
    ).length,
    fundedAlerts: state.items.filter(
      ({ lifecycle, severity }) =>
        lifecycle === "funded" &&
        (severity === "critical" || severity === "warning"),
    ).length,
    rexInconclusive: state.items.reduce(
      (total, item) => total + item.reliability.inconclusiveRexReports,
      0,
    ),
    rexNotMerged: state.items.reduce(
      (total, item) => total + item.reliability.notMergedRexReports,
      0,
    ),
    failedSamples: state.items.reduce(
      (total, item) => total + item.reliability.failedTransactions,
      0,
    ),
  }), [state.items]);

  const hasFilters =
    Boolean(query.trim()) ||
    lifecycleFilter !== "all" ||
    ageFilter !== "all" ||
    networkFilter !== "all" ||
    errorFilter !== "all";
  const isBusy = state.status === "loading" || state.refreshing;
  const hasLoadedWorkflows = state.items.length > 0;
  const syncTone = network.rpcStatus !== "available"
    ? "offline"
    : state.error || state.readErrors > 0
      ? "partial"
      : isBusy
        ? "syncing"
        : "live";

  function resetFilters() {
    setQuery("");
    setLifecycleFilter("all");
    setAgeFilter("all");
    setNetworkFilter("all");
    setErrorFilter("all");
  }

  function reconcileNow() {
    void loadDiagnostics({ preserve: state.items.length > 0 });
  }

  return (
    <section className={`workflow-diagnostics${hasLoadedWorkflows ? "" : " workflow-diagnostics--empty"}`} aria-busy={isBusy} aria-labelledby="diagnostics-title">
      <header className="workflow-diagnostics__header">
        <div>
          <p className="panel-label">PROGRAM-WIDE ACCOUNT HEALTH</p>
          <h2 id="diagnostics-title">Workflow diagnostics</h2>
          <p>
            Each record starts from a confirmed program transaction and is
            reconciled against the current workflow account and latest activity.
          </p>
        </div>
        <div className="workflow-diagnostics__header-actions">
          <span className="settlement-live-indicator" data-status={syncTone}>
            <i aria-hidden="true" />
            {syncTone === "offline"
              ? "Connection paused"
              : syncTone === "partial"
                ? "Partial read"
                : syncTone === "syncing"
                  ? "Reconciling"
                  : "Live reads"}
          </span>
          <button
            className="activity-refresh"
            data-loading={isBusy}
            disabled={network.rpcStatus !== "available" || isBusy}
            onClick={reconcileNow}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={15} strokeWidth={1.8} />
            <span>Reconcile now</span>
          </button>
        </div>
      </header>

      <div className="workflow-diagnostics__source">
        <div className="workflow-diagnostics__source-mark" aria-hidden="true">
          <Waypoints size={18} strokeWidth={1.7} />
        </div>
        <div>
          <span>Active program · {network.label}</span>
          <CopyValue value={network.client.programId} />
        </div>
        <small suppressHydrationWarning>
          {state.lastChecked
            ? `Last reconciled ${formatLocalTime(state.lastChecked)}`
            : "Waiting for the first verified read"}
        </small>
      </div>

      <div className="workflow-diagnostics__summary" aria-label="Loaded diagnostic summary">
        <DiagnosticMetric label="Loaded workflows" value={state.items.length} />
        <DiagnosticMetric label="Need attention" tone={summary.attention > 0 ? "critical" : "healthy"} value={summary.attention} />
        <DiagnosticMetric label="Funded escrow" value={summary.funded} />
        <DiagnosticMetric label="Terminal" tone="healthy" value={summary.terminal} />
      </div>

      <div className="workflow-diagnostics__reliability" aria-label="Operational reliability">
        <ReliabilityMetric
          icon={<Activity aria-hidden="true" size={17} strokeWidth={1.8} />}
          label="Rialo RPC"
          tone={
            network.rpcStatus === "available"
              ? "healthy"
              : network.rpcStatus === "checking"
                ? "warning"
                : "critical"
          }
          value={
            network.rpcStatus === "available"
              ? `Available${network.rpcLatencyMs === null ? "" : ` · ${network.rpcLatencyMs} ms`}`
              : network.rpcStatus === "checking"
                ? "Checking"
                : "Degraded"
          }
          detail={
            network.rpcLastSuccessfulAt === null
              ? "No successful health read in this session"
              : `Last success ${formatLocalTime(network.rpcLastSuccessfulAt)} · ${network.rpcConsecutiveFailures} consecutive failures`
          }
        />
        <ReliabilityMetric
          icon={<Clock3 aria-hidden="true" size={17} strokeWidth={1.8} />}
          label="Funded workflow watch"
          tone={summary.fundedAlerts > 0 ? "critical" : "healthy"}
          value={`${summary.fundedAlerts} ${summary.fundedAlerts === 1 ? "alert" : "alerts"}`}
          detail={`${summary.funded} funded workflows loaded · stale checks and overdue refunds are surfaced`}
        />
        <ReliabilityMetric
          icon={<GitBranch aria-hidden="true" size={17} strokeWidth={1.8} />}
          label="REX proof samples"
          tone={summary.rexInconclusive > 0 || summary.failedSamples > 0 ? "warning" : "healthy"}
          value={`${summary.rexInconclusive} inconclusive`}
          detail={`${summary.rexNotMerged} valid not-merged proofs · ${summary.failedSamples} failed transactions`}
        />
      </div>

      <div className="workflow-diagnostics__tools">
        <label className="workflow-diagnostics__search" htmlFor="diagnostic-search">
          <Search aria-hidden="true" size={15} strokeWidth={1.8} />
          <span className="sr-only">Search diagnostics</span>
          <input
            id="diagnostic-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search repo, PR, workflow, sponsor"
            type="search"
            value={query}
          />
        </label>
        <span>
          {visibleItems.length} shown · {state.scannedTransactions} transactions scanned
        </span>
      </div>

      <div className="workflow-diagnostics__filters" aria-label="Diagnostic filters">
        <DiagnosticSelect
          label="Status"
          onChange={(value) => setLifecycleFilter(value as LifecycleFilter)}
          value={lifecycleFilter}
          options={[
            ["all", "All states"],
            ["created", "Created"],
            ["claimed", "Claimed"],
            ["funded", "Funded"],
            ["merge_confirmed", "Merge confirmed"],
            ["paid", "Paid"],
            ["refunded", "Refunded"],
            ["invalid", "Invalid"],
            ["unavailable", "Unavailable"],
          ]}
        />
        <DiagnosticSelect
          label="Age"
          onChange={(value) => setAgeFilter(value as AgeFilter)}
          value={ageFilter}
          options={[
            ["all", "Any age"],
            ["hour", "Under 1 hour"],
            ["day", "1–24 hours"],
            ["older", "Older than 24h"],
            ["overdue", "Past deadline"],
          ]}
        />
        <DiagnosticSelect
          label="Network"
          onChange={setNetworkFilter}
          value={networkFilter}
          options={[
            ["all", "All loaded networks"],
            [network.network, network.label],
          ]}
        />
        <DiagnosticSelect
          label="Latest error"
          onChange={(value) => setErrorFilter(value as ErrorFilter)}
          value={errorFilter}
          options={[
            ["all", "Any finding"],
            ["attention", "Needs attention"],
            ["read", "RPC/account read"],
            ["transaction", "Failed transaction"],
            ["rex", "Inconclusive REX"],
            ["clear", "No current error"],
          ]}
        />
        {hasFilters ? (
          <button className="workflow-diagnostics__clear" onClick={resetFilters} type="button">
            Clear filters
          </button>
        ) : null}
      </div>

      {state.items.length > 0 && (state.error || network.rpcStatus !== "available" || state.readErrors > 0) ? (
        <div className="workflow-diagnostics__notice" role="status">
          <AlertCircle aria-hidden="true" size={16} strokeWidth={1.8} />
          <p>
            <strong>Showing the last verified diagnostic set.</strong>{" "}
            {network.rpcStatus !== "available"
              ? "Reconciliation resumes when Rialo reconnects."
              : state.error
                ? `The latest pass stopped: ${state.error.message}`
                : `${state.readErrors} read ${state.readErrors === 1 ? "needs" : "need"} another pass.`}
          </p>
        </div>
      ) : null}

      {network.rpcStatus !== "available" && state.items.length === 0 ? (
        <DiagnosticEmpty
          icon={<Clock3 aria-hidden="true" size={21} strokeWidth={1.7} />}
          title="Waiting for Rialo DevNet"
          description="Diagnostics begin after the RPC health check succeeds. No cached sample records are shown."
        />
      ) : state.status === "loading" && state.items.length === 0 ? (
        <DiagnosticLoading />
      ) : state.status === "error" && state.items.length === 0 ? (
        <DiagnosticEmpty
          action={<button className="button button--dark" onClick={reconcileNow} type="button">Try again</button>}
          icon={<ShieldAlert aria-hidden="true" size={21} strokeWidth={1.7} />}
          title="Diagnostics could not be read"
          description={state.error?.message ?? "Rialo did not return a usable program history response."}
          tone="error"
        />
      ) : visibleItems.length === 0 ? (
        <DiagnosticEmpty
          action={hasFilters ? <button className="button button--dark" onClick={resetFilters} type="button">Clear filters</button> : <div className="workflow-diagnostics__empty-actions">
            <Link className="button" href={routes.createBounty}>Create a bounty</Link>
            <Link className="button button--dark" href={routes.guide}>View guide</Link>
          </div>}
          icon={hasFilters ? <CheckCircle2 aria-hidden="true" size={21} strokeWidth={1.7} /> : <Waypoints aria-hidden="true" size={21} strokeWidth={1.7} />}
          title={hasFilters ? "No workflow matches these filters" : "No live workflows yet"}
          description={hasFilters ? "The loaded onchain records are still available; adjust or clear the current filters." : "Create your first bounty to start an onchain workflow. Once it is funded, it will appear here for read-only monitoring."}
        />
      ) : (
        <div className="workflow-diagnostics__list" aria-live="polite">
          {visibleItems.map((item) => (
            <DiagnosticRow
              item={item}
              key={item.workflowAddress}
              referenceTime={diagnosticReferenceTime}
            />
          ))}
        </div>
      )}

      <footer className="workflow-diagnostics__footer">
        <div>
          <Activity aria-hidden="true" size={15} strokeWidth={1.8} />
          <span>
            {!hasLoadedWorkflows
              ? "No workflow history yet"
              : state.readErrors > 0
              ? `${state.readErrors} incomplete ${state.readErrors === 1 ? "read" : "reads"}`
              : "All loaded account reads completed"}
          </span>
        </div>
        {state.hasMore ? (
          <button
            className="button button--dark"
            disabled={isBusy}
            onClick={() => void loadDiagnostics({ append: true })}
            type="button"
          >
            {state.refreshing ? "Loading history…" : "Load older workflows"}
          </button>
        ) : (
          <span>End of loaded DevNet history</span>
        )}
      </footer>
    </section>
  );
}

function DiagnosticMetric({
  label,
  tone = "default",
  value,
}: Readonly<{
  label: string;
  tone?: "default" | "healthy" | "critical";
  value: number;
}>) {
  return (
    <div data-tone={tone}>
      <span>{label}</span>
      <strong>{String(value).padStart(2, "0")}</strong>
    </div>
  );
}

function ReliabilityMetric({
  detail,
  icon,
  label,
  tone,
  value,
}: Readonly<{
  detail: string;
  icon: ReactNode;
  label: string;
  tone: "healthy" | "warning" | "critical";
  value: string;
}>) {
  return (
    <div data-tone={tone}>
      <span className="workflow-diagnostics__reliability-icon">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small suppressHydrationWarning>{detail}</small>
      </div>
    </div>
  );
}

function DiagnosticSelect({
  label,
  onChange,
  options,
  value,
}: Readonly<{
  label: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
  value: string;
}>) {
  return (
    <label>
      <span>{label}</span>
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function DiagnosticRow({
  item,
  referenceTime,
}: Readonly<{
  item: MergePayWorkflowDiagnostic;
  referenceTime: number;
}>) {
  const network = useNetwork();
  const state = item.workflow?.state;
  const repository = state
    ? `${state.githubOwner}/${state.githubRepo}`
    : "Unverified workflow account";
  const latestSignature = item.latestActivity?.signature ?? item.createdSignature;
  const latestTime = formatChainTime(
    item.latestActivity?.blockTime ?? item.createdBlockTime,
  );
  const detailHref = `${routes.bounty(item.workflowSlug)}?sponsor=${encodeURIComponent(item.sponsor)}&account=${encodeURIComponent(item.workflowAddress)}`;

  return (
    <article className="workflow-diagnostic" data-severity={item.severity}>
      <div className="workflow-diagnostic__identity">
        <span className="workflow-diagnostic__mark" aria-hidden="true">
          {item.severity === "critical" || item.severity === "warning" ? (
            <ShieldAlert size={17} strokeWidth={1.8} />
          ) : (
            <CheckCircle2 size={17} strokeWidth={1.8} />
          )}
        </span>
        <div>
          <p className="panel-label">{network.label.toUpperCase()}</p>
          <h3>{repository}</h3>
          <small>{state ? `Pull request #${state.pullNumber.toString()}` : "Creation proof retained for review"}</small>
        </div>
        <span className="workflow-diagnostic__state" data-severity={item.severity}>
          {lifecycleLabels[item.lifecycle]}
        </span>
      </div>

      <div className="workflow-diagnostic__facts">
        <div>
          <span>Workflow age</span>
          <strong>{formatRelativeAge(item.createdBlockTime, referenceTime)}</strong>
        </div>
        <div>
          <span>Latest activity</span>
          <strong>{item.latestActivity ? actionLabel(item.latestActivity.action) : "Unavailable"}</strong>
          <small suppressHydrationWarning>{latestTime.label}</small>
        </div>
        <div>
          <span>Escrow</span>
          <strong>{state ? `${formatRlo(state.amountKelvin)} RLO` : "Unverified"}</strong>
          <small>{state?.funded && !state.paid && !state.refunded ? "Value remains in workflow" : "No active escrow finding"}</small>
        </div>
        <div>
          <span>Merge checks</span>
          <strong>{state ? state.checks.toString() : "—"}</strong>
          <small>
            {state
              ? `${formatRexSignal(item.reliability.latestRexSignal)} · deadline ${formatDeadlineCompact(state.deadlineUnixMs)}`
              : "Deadline unavailable"}
          </small>
        </div>
      </div>

      <div className="workflow-diagnostic__finding">
        <div>
          <span>Latest finding</span>
          <strong>{findingLabels[item.finding]}</strong>
          <p>{item.message}</p>
          {item.readError ? <code>{item.readError}</code> : null}
        </div>
        <div className="workflow-diagnostic__transaction">
          <span>LATEST TRANSACTION</span>
          <TransactionProof signature={latestSignature} />
        </div>
      </div>

      <div className="workflow-diagnostic__actions">
        <Link href={detailHref}>Open workflow</Link>
        <a
          href={getRialoScanSearchUrl(item.workflowAddress)}
          rel="noreferrer noopener"
          target="_blank"
        >
          Account <ExternalLink aria-hidden="true" size={12} strokeWidth={1.9} />
        </a>
        <LineageInspector signature={latestSignature} />
      </div>
    </article>
  );
}

function LineageInspector({ signature }: Readonly<{ signature: string }>) {
  const network = useNetwork();
  const [state, setState] = useState<
    | { status: "idle" | "loading" }
    | { status: "ready"; nodes: number; downstream: number; failed: number; truncated: boolean }
    | { status: "error"; message: string }
  >({ status: "idle" });

  async function inspect() {
    if (state.status === "loading") return;
    setState({ status: "loading" });
    try {
      const result = await network.client.getWorkflowLineage(signature);
      const nodes = result.lineage.workflowNodes;
      setState({
        status: "ready",
        nodes: nodes.length,
        downstream: nodes.filter((node) => node.id !== signature).length,
        failed: nodes.filter((node) => !node.data.success).length,
        truncated: result.truncated,
      });
    } catch (cause) {
      setState({
        status: "error",
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  return (
    <div className="workflow-lineage">
      <button disabled={state.status === "loading"} onClick={() => void inspect()} type="button">
        <GitBranch aria-hidden="true" size={13} strokeWidth={1.9} />
        {state.status === "loading" ? "Reading lineage…" : state.status === "idle" ? "Inspect lineage" : "Refresh lineage"}
      </button>
      {state.status === "ready" ? (
        <p role="status">
          <strong>{state.nodes} nodes</strong> · {state.downstream} downstream · {state.failed} failed
          {state.truncated ? " · bounded at depth 5" : ""}
        </p>
      ) : state.status === "error" ? (
        <p data-error="true" role="status">Lineage unavailable: {state.message}</p>
      ) : null}
    </div>
  );
}

function DiagnosticEmpty({
  action,
  description,
  icon,
  title,
  tone = "default",
}: Readonly<{
  action?: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
  tone?: "default" | "error";
}>) {
  return (
    <div className="workflow-diagnostics__empty" data-tone={tone}>
      <span aria-hidden="true">{icon}</span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
        {action}
      </div>
    </div>
  );
}

function DiagnosticLoading() {
  return (
    <div className="workflow-diagnostics__loading" role="status">
      {[0, 1, 2].map((index) => (
        <div key={index}><span /><span /><span /></div>
      ))}
      <p>Reconciling verified program history with live workflow accounts…</p>
    </div>
  );
}

function mergeDiagnostics(
  current: MergePayWorkflowDiagnostic[],
  incoming: MergePayWorkflowDiagnostic[],
): MergePayWorkflowDiagnostic[] {
  const byAddress = new Map(current.map((item) => [item.workflowAddress, item]));
  for (const item of incoming) byAddress.set(item.workflowAddress, item);
  return [...byAddress.values()];
}

function actionLabel(action: string): string {
  return action.replaceAll("_", " ");
}

function formatRexSignal(
  signal: MergePayWorkflowDiagnostic["reliability"]["latestRexSignal"],
): string {
  if (signal === "not_merged") return "REX: not merged";
  if (signal === "inconclusive") return "REX: inconclusive";
  if (signal === "merged") return "REX: merged";
  return "No sampled REX proof";
}

function blockTimeToMs(value: bigint | null): number | null {
  if (value === null) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric > 100_000_000_000 ? numeric : numeric * 1_000;
}

function formatRelativeAge(value: bigint | null, referenceTime: number): string {
  const timestamp = blockTimeToMs(value);
  if (timestamp === null) return "Age unavailable";
  const elapsed = Math.max(0, referenceTime - timestamp);
  if (elapsed < 60_000) return "Under a minute";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} hr`;
  return `${Math.floor(elapsed / 86_400_000)} days`;
}

function formatChainTime(value: bigint | null): { iso: string; label: string } {
  const timestamp = blockTimeToMs(value);
  if (timestamp === null) return { iso: "", label: "Time unavailable" };
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return { iso: "", label: "Time unavailable" };
  return {
    iso: date.toISOString(),
    label: formatLocalDateTime(date),
  };
}

function formatDeadlineCompact(value: bigint): string {
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return "unavailable";
  return formatLocalDateTime(date);
}
