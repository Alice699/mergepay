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
import { CopyValue } from "@/components/ui/copy-value";

type ActivityState =
  | { status: "idle"; items: MergePayActivityItem[]; error: null }
  | { status: "loading"; items: MergePayActivityItem[]; error: null }
  | { status: "ready"; items: MergePayActivityItem[]; error: null }
  | { status: "error"; items: MergePayActivityItem[]; error: Error };

const actionLabels: Record<MergePayInstructionName | "network", string> = {
  create_bounty: "Created bounty",
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
  const [state, setState] = useState<ActivityState>({
    status: "idle",
    items: [],
    error: null,
  });
  const requestRef = useRef(0);

  const loadActivity = useCallback(async () => {
    if (!wallet.address || network.rpcStatus !== "available") return;

    const requestId = ++requestRef.current;
    setState((current) => ({ status: "loading", items: current.items, error: null }));

    try {
      const items = await network.client.getWalletActivity(wallet.address, 14);
      if (requestId !== requestRef.current) return;
      setState({ status: "ready", items, error: null });
    } catch (cause) {
      if (requestId !== requestRef.current) return;
      setState({
        status: "error",
        items: [],
        error: cause instanceof Error ? cause : new Error(String(cause)),
      });
    }
  }, [network.client, network.rpcStatus, wallet.address]);

  useEffect(() => {
    requestRef.current += 1;
    if (!wallet.address || network.rpcStatus !== "available") {
      return;
    }

    const timer = window.setTimeout(() => void loadActivity(), 0);
    return () => {
      window.clearTimeout(timer);
      requestRef.current += 1;
    };
  }, [loadActivity, network.rpcStatus, wallet.address]);

  const sourceLabel = wallet.source === "embedded"
    ? "Embedded DevNet wallet"
    : wallet.walletName ?? "Connected wallet";

  return (
    <section className="wallet-activity" aria-labelledby="wallet-activity-title">
      <div className="wallet-activity__header">
        <div>
          <p className="panel-label">CONNECTED WALLET</p>
          <h2 id="wallet-activity-title">Your activity</h2>
          <p>Only transactions involving the active wallet are shown here. The feed is read from Rialo DevNet.</p>
        </div>
        <button
          aria-label="Refresh wallet activity"
          className="activity-refresh"
          data-loading={state.status === "loading"}
          disabled={!wallet.address || network.rpcStatus !== "available" || state.status === "loading"}
          onClick={() => void loadActivity()}
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
          icon={<WalletCards aria-hidden="true" size={20} strokeWidth={1.7} />}
          title="Connect a wallet to see activity."
          description="Open the wallet control in the header and connect an extension or unlock the embedded DevNet wallet."
          action={<Link className="button button--dark" href="/bounties/new">Create a bounty</Link>}
        />
      ) : network.rpcStatus !== "available" ? (
        <ActivityEmptyState
          icon={<CircleDashed aria-hidden="true" size={20} strokeWidth={1.7} />}
          title="Waiting for Rialo DevNet."
          description="The connected address is ready, but the RPC has not reported a healthy response yet. Activity will appear when the connection is available."
          action={<button className="button button--dark" onClick={network.refreshRpcHealth} type="button">Check connection</button>}
        />
      ) : state.status === "loading" && state.items.length === 0 ? (
        <ActivityLoadingState />
      ) : state.status === "error" ? (
        <ActivityEmptyState
          icon={<AlertCircle aria-hidden="true" size={20} strokeWidth={1.7} />}
          title="Activity could not be read."
          description={state.error.message || "Rialo did not return a usable activity response."}
          action={<button className="button button--dark" onClick={() => void loadActivity()} type="button">Try again</button>}
          tone="error"
        />
      ) : state.items.length === 0 ? (
        <ActivityEmptyState
          icon={<Clock3 aria-hidden="true" size={20} strokeWidth={1.7} />}
          title="No activity for this wallet yet."
          description="Create or fund a workflow to make the first real MergePay transaction appear in this feed."
          action={<Link className="button button--dark" href="/bounties/new">Create a bounty</Link>}
        />
      ) : (
        <div className="wallet-activity__list" aria-live="polite">
          <div className="wallet-activity__list-header">
            <span>ACTIVITY</span>
            <span>STATUS</span>
            <span>TRANSACTION</span>
          </div>
          {state.items.map((item) => <ActivityRow item={item} key={item.signature} />)}
        </div>
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
        <CopyValue value={item.signature} />
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

function ActivityEmptyState({
  action,
  description,
  icon,
  title,
  tone,
}: Readonly<{
  action: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
  tone?: "error";
}>) {
  return (
    <div className="wallet-activity__empty" data-tone={tone ?? "default"}>
      <div className="wallet-activity__empty-icon">{icon}</div>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
        {action}
      </div>
    </div>
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
