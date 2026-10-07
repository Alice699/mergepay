"use client";

import type { MergePayActivityItem, MergePayActivityPage, MergePayInstructionName } from "@mergepay/rialo-client";
import { AlertCircle, Check, ChevronDown, ChevronLeft, History, LoaderCircle, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { TransactionProof } from "@/components/ui/transaction-proof";
import { useNetwork } from "@/hooks/use-network";
import { asError, describeRialoError } from "@/lib/errors";
import { formatLocalDateTime, formatRlo, shortenAddress } from "@/lib/format";

const HISTORY_PAGE_SIZE = 8;

const actionLabels: Record<MergePayInstructionName | "network", string> = {
  create_bounty: "Created bounty",
  prepare_funding: "Prepared escrow storage",
  fund: "Funded escrow",
  check_merge: "Requested merge check",
  refund: "Refunded escrow",
  status: "Read workflow",
  request_claim: "Requested bounty claim",
  accept_claim: "Approved contributor",
  network: "Network transaction",
};

type HistoryState = MergePayActivityPage & {
  status: "idle" | "loading" | "ready" | "error";
  error: Error | null;
  pageIndex: number;
};

const initialState: HistoryState = {
  items: [],
  hasMore: false,
  nextBefore: null,
  status: "idle",
  error: null,
  pageIndex: 0,
};

export function WalletActivityView({
  accountName,
  address,
  networkSupported,
  onBack,
  onClose,
}: Readonly<{
  accountName: string;
  address: string;
  networkSupported: boolean | null;
  onBack: () => void;
  onClose: () => void;
}>) {
  const network = useNetwork();
  const [state, setState] = useState<HistoryState>(initialState);
  const requestRef = useRef(0);
  const pageCursorsRef = useRef<Array<string | undefined>>([undefined]);
  const backRef = useRef<HTMLButtonElement>(null);
  const canRead = network.rpcStatus === "available" && networkSupported !== false;

  const loadPage = useCallback(async (pageIndex: number, before?: string, clearItems = false) => {
    if (!canRead) return;
    const requestId = ++requestRef.current;
    setState((current) => ({
      ...(clearItems ? initialState : current),
      status: "loading",
      error: null,
    }));
    try {
      const page = await network.client.getWalletActivityPage(address, {
        limit: HISTORY_PAGE_SIZE,
        ...(before ? { before } : {}),
      });
      if (requestId !== requestRef.current) return;
      if (pageIndex === 0) pageCursorsRef.current = [undefined];
      if (page.hasMore && page.nextBefore) {
        pageCursorsRef.current[pageIndex + 1] = page.nextBefore;
      } else {
        pageCursorsRef.current = pageCursorsRef.current.slice(0, pageIndex + 1);
      }
      setState({ ...page, status: "ready", error: null, pageIndex });
    } catch (cause) {
      if (requestId !== requestRef.current) return;
      // A failed refresh must not erase already loaded history or its cursors.
      setState((current) => ({ ...current, status: "error", error: asError(cause) }));
    }
  }, [address, canRead, network.client]);

  useEffect(() => {
    backRef.current?.focus();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPage(0, undefined, true), 0);
    return () => {
      window.clearTimeout(timer);
      // Ignore late RPC responses after closing, locking, or changing account/network.
      requestRef.current += 1;
    };
  }, [loadPage]);

  const loading = state.status === "idle" || state.status === "loading";

  return (
    <section aria-labelledby="wallet-history-title" className="wallet-history">
      <header className="wallet-history__header">
        <button aria-label="Back to wallet" onClick={onBack} ref={backRef} title="Back to balance" type="button">
          <ChevronLeft aria-hidden="true" size={20} />
        </button>
        <h2 id="wallet-history-title">Activity</h2>
        <button aria-label="Close wallet" onClick={onClose} title="Close wallet" type="button"><X aria-hidden="true" size={18} /></button>
      </header>

      <div className="wallet-history__account">
        <div><strong title={accountName}>{accountName}</strong><code title={address}>{shortenAddress(address, 6)}</code></div>
        <span>{network.label}</span>
      </div>

      <div className="wallet-history__toolbar">
        <span>Recent transactions</span>
        <button aria-label="Refresh wallet transactions" disabled={!canRead || loading} onClick={() => void loadPage(0)} title="Refresh transactions" type="button">
          <RefreshCw aria-hidden="true" className={canRead && loading ? "ui-icon--spin" : undefined} size={14} />
        </button>
      </div>

      {!canRead ? (
        <div className="wallet-history__empty" role="status">
          {network.rpcStatus === "checking" && networkSupported !== false ? <LoaderCircle aria-hidden="true" className="ui-icon--spin" size={24} /> : <AlertCircle aria-hidden="true" size={24} />}
          <h3>{networkSupported === false ? "Different wallet network" : network.rpcStatus === "checking" ? "Connecting to Rialo" : "RPC unavailable"}</h3>
          <p>{networkSupported === false ? `Switch your wallet to ${network.label} to read this account’s history.` : "Transaction history will appear when the RPC connection is available."}</p>
          {network.rpcStatus === "unavailable" && networkSupported !== false && <button onClick={network.refreshRpcHealth} type="button">Try again</button>}
        </div>
      ) : (
        <div aria-busy={loading} className="wallet-history__body">
          {state.error && (
            <div className="wallet-history__error" role="alert">
              <AlertCircle aria-hidden="true" size={17} />
              <div>
                <strong>{state.items.length ? "Latest refresh was interrupted" : "Activity could not be loaded"}</strong>
                <p>{state.items.length ? "Showing the last loaded transactions. Try refreshing again." : describeRialoError(state.error)}</p>
                <button onClick={() => void loadPage(state.pageIndex, pageCursorsRef.current[state.pageIndex])} type="button">Try again</button>
              </div>
            </div>
          )}
          {loading && (
            <p aria-label="Loading wallet transactions" className="wallet-history__loading" role="status"><LoaderCircle aria-hidden="true" className="ui-icon--spin" size={16} /> Reading transactions from Rialo…</p>
          )}
          {state.items.length > 0 ? (
            <div className="wallet-history__list">
              {state.items.map((item) => <WalletHistoryRow item={item} key={item.signature} />)}
            </div>
          ) : state.status === "ready" ? (
            <div className="wallet-history__empty" role="status">
              <History aria-hidden="true" size={27} />
              <h3>No transactions yet</h3>
              <p>No onchain transactions were found for this account on {network.label}.</p>
            </div>
          ) : null}
          {(state.items.length > 0 || state.pageIndex > 0) && (
            <nav aria-label="Wallet transaction pages" className="wallet-history__pagination">
              <button disabled={state.pageIndex === 0 || loading} onClick={() => void loadPage(state.pageIndex - 1, pageCursorsRef.current[state.pageIndex - 1])} type="button">Previous</button>
              <span aria-live="polite">Page <strong>{state.pageIndex + 1}</strong></span>
              <button disabled={!state.hasMore || !state.nextBefore || loading} onClick={() => void loadPage(state.pageIndex + 1, state.nextBefore ?? undefined)} type="button">Next</button>
            </nav>
          )}
        </div>
      )}

      <footer className="wallet-history__footer">Newest first. Confirmed means executed, not necessarily paid.</footer>
    </section>
  );
}

function WalletHistoryRow({ item }: Readonly<{ item: MergePayActivityItem }>) {
  const failed = item.status === "failed";
  const time = activityTime(item.blockTime);

  return (
    <details className="wallet-history__row" data-status={item.status}>
      <summary>
        <span aria-hidden="true" className="wallet-history__mark">{failed ? <AlertCircle size={18} /> : <Check size={18} />}</span>
        <div className="wallet-history__transaction">
          <h3>{actionLabels[item.action]}</h3>
          {time.iso ? <time dateTime={time.iso}>{time.label}</time> : <span className="wallet-history__time">{time.label}</span>}
        </div>
        <span className="wallet-history__result">{failed ? "Failed" : "Confirmed"}<ChevronDown aria-hidden="true" size={13} /></span>
      </summary>
      <div className="wallet-history__details">
        <span>Transaction</span>
        <TransactionProof signature={item.signature} />
        {item.feeKelvin !== null && <p>Network fee <strong>{formatRlo(item.feeKelvin)} RLO</strong></p>}
        {item.workflowAddress && <p>Workflow <code title={item.workflowAddress}>{shortenAddress(item.workflowAddress, 6)}</code></p>}
        {item.rexSignal === "inconclusive" && <p className="wallet-history__warning">REX proof inconclusive. This is not a payout receipt.</p>}
        {item.error && <p className="wallet-history__failure">{item.error}</p>}
      </div>
    </details>
  );
}

function activityTime(blockTime: bigint | null): { iso: string; label: string } {
  if (blockTime === null) return { iso: "", label: "Time unavailable" };
  const value = Number(blockTime);
  const date = new Date(value > 100_000_000_000 ? value : value * 1_000);
  if (!Number.isFinite(date.getTime())) return { iso: "", label: "Time unavailable" };
  return { iso: date.toISOString(), label: formatLocalDateTime(date) };
}
