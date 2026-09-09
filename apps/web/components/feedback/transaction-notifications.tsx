"use client";

import {
  Check,
  CircleAlert,
  LoaderCircle,
  RadioTower,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@/hooks/use-wallet";
import { describeRialoError } from "@/lib/errors";
import { shortenAddress } from "@/lib/format";
import {
  APP_NOTIFICATION_EVENT,
  type AppNotification,
  type AppNotificationTone,
} from "@/lib/app-notifications";
import type {
  EmbeddedWalletFundingPhase,
  WalletTransactionPhase,
} from "@/providers/wallet-context";

type NoticeTone = AppNotificationTone | "pending";

interface NoticeProps {
  id: string;
  title: string;
  message: string;
  tone: NoticeTone;
  signature?: string | null;
  onDismiss: (id: string) => void;
  durationMs?: number | null;
}

function transactionCopy(phase: WalletTransactionPhase, action: string) {
  switch (phase) {
    case "reviewing":
      return {
        title: `Review ${action.toLowerCase()}`,
        message: "Check the transaction details before approving it.",
      };
    case "signing":
      return {
        title: "Waiting for your signature",
        message: `Approve ${action.toLowerCase()} in your Rialo wallet.`,
      };
    case "submitting":
      return {
        title: "Confirming transaction",
        message: `${action} was submitted. Waiting for Rialo confirmation.`,
      };
    case "confirmed":
      return {
        title: `${action} confirmed`,
        message: "Rialo confirmed the transaction. Workflow status will update automatically.",
      };
    default:
      return null;
  }
}

function fundingCopy(phase: EmbeddedWalletFundingPhase) {
  if (phase === "requesting") {
    return {
      title: "Requesting DevNet funds",
      message: "Waiting for the Rialo faucet transaction to confirm.",
    };
  }
  if (phase === "confirmed") {
    return {
      title: "DevNet funds received",
      message: "1 RLO was added to this wallet.",
    };
  }
  return null;
}

function Notice({
  id,
  title,
  message,
  tone,
  signature,
  onDismiss,
  durationMs,
}: Readonly<NoticeProps>) {
  useEffect(() => {
    if (!durationMs) return;
    const timeout = window.setTimeout(() => onDismiss(id), durationMs);
    return () => window.clearTimeout(timeout);
  }, [durationMs, id, onDismiss]);

  const Icon =
    tone === "success"
      ? Check
      : tone === "error"
        ? CircleAlert
        : tone === "pending"
          ? LoaderCircle
          : RadioTower;

  return (
    <section
      aria-atomic="true"
      aria-live={tone === "error" ? "assertive" : "polite"}
      className="transaction-notice"
      data-tone={tone}
      role={tone === "error" ? "alert" : "status"}
    >
      <span className="transaction-notice__icon">
        <Icon
          aria-hidden="true"
          className={tone === "pending" ? "ui-icon--spin" : undefined}
          size={17}
        />
      </span>
      <div className="transaction-notice__content">
        <strong>{title}</strong>
        <p>{message}</p>
        {signature ? (
          <span className="transaction-notice__signature mono" title={signature}>
            TX {shortenAddress(signature, 7)}
          </span>
        ) : null}
      </div>
      <button
        aria-label={`Dismiss ${title}`}
        className="transaction-notice__dismiss"
        onClick={() => onDismiss(id)}
        type="button"
      >
        <X aria-hidden="true" size={15} />
      </button>
    </section>
  );
}

function DismissibleNotice(
  props: Readonly<Omit<NoticeProps, "onDismiss">>,
) {
  const [visible, setVisible] = useState(true);
  const dismiss = useCallback(() => setVisible(false), []);
  if (!visible) return null;
  return <Notice {...props} onDismiss={dismiss} />;
}

export function TransactionNotifications() {
  const wallet = useWallet();
  const { transaction } = wallet;
  const funding = wallet.embedded.funding;
  const [workflowNotices, setWorkflowNotices] = useState<AppNotification[]>([]);

  const transactionKey = `${transaction.phase}:${transaction.signature ?? ""}:${transaction.intent?.action ?? ""}:${transaction.error?.message ?? ""}`;
  const fundingKey = `${funding.phase}:${funding.signature ?? ""}:${funding.error?.message ?? ""}`;

  useEffect(() => {
    function receiveNotification(event: Event) {
      const notification = (event as CustomEvent<AppNotification>).detail;
      if (!notification?.id || !notification.title || !notification.message) return;
      setWorkflowNotices((current) => [...current, notification].slice(-3));
    }

    window.addEventListener(APP_NOTIFICATION_EVENT, receiveNotification);
    return () => window.removeEventListener(APP_NOTIFICATION_EVENT, receiveNotification);
  }, []);

  const dismissWorkflowNotice = useCallback((id: string) => {
    setWorkflowNotices((current) => current.filter((notice) => notice.id !== id));
  }, []);

  const transactionNotice = useMemo(() => {
    if (transaction.phase === "idle") return null;

    const action = transaction.intent?.action ?? "Transaction";
    if (transaction.phase === "failed") {
      return {
        id: transactionKey,
        title: `${action} failed`,
        message: describeRialoError(transaction.error),
        tone: "error" as const,
        durationMs: 12_000,
      };
    }

    const copy = transactionCopy(transaction.phase, action);
    if (!copy) return null;
    return {
      id: transactionKey,
      ...copy,
      tone: transaction.phase === "confirmed" ? ("success" as const) : ("pending" as const),
      durationMs: transaction.phase === "confirmed" ? 7_000 : null,
    };
  }, [transaction, transactionKey]);

  const fundingNotice = useMemo(() => {
    if (funding.phase === "idle") return null;
    if (funding.phase === "failed") {
      return {
        id: fundingKey,
        title: "DevNet funding failed",
        message: describeRialoError(funding.error),
        tone: "error" as const,
        durationMs: 12_000,
      };
    }

    const copy = fundingCopy(funding.phase);
    if (!copy) return null;
    return {
      id: fundingKey,
      ...copy,
      tone: funding.phase === "confirmed" ? ("success" as const) : ("pending" as const),
      durationMs: funding.phase === "confirmed" ? 7_000 : null,
    };
  }, [funding, fundingKey]);

  if (!transactionNotice && !fundingNotice && workflowNotices.length === 0) {
    return null;
  }

  return (
    <div className="transaction-notifications" aria-label="Transaction notifications">
      {transactionNotice ? (
        <DismissibleNotice
          {...transactionNotice}
          key={transactionNotice.id}
          signature={transaction.signature}
        />
      ) : null}
      {fundingNotice ? (
        <DismissibleNotice
          {...fundingNotice}
          key={fundingNotice.id}
          signature={funding.signature}
        />
      ) : null}
      {workflowNotices.map((notice) => (
        <Notice
          durationMs={notice.durationMs ?? 9_000}
          id={notice.id}
          key={notice.id}
          message={notice.message}
          onDismiss={dismissWorkflowNotice}
          signature={notice.signature ?? null}
          title={notice.title}
          tone={notice.tone}
        />
      ))}
    </div>
  );
}
