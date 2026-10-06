import type { Metadata } from "next";
import { Activity, ReceiptText } from "lucide-react";
import Link from "next/link";
import { SettlementActivityFeed } from "@/components/settlement/settlement-activity-feed";

export const metadata: Metadata = {
  title: "Settlements",
  description: "See paid and refunded MergePay bounties associated with the connected Rialo wallet.",
};

export default function SettlementsPage() {
  return (
    <main className="page-main page-width liquid-slate-page ledger-page transaction-ledger-page settlements-page">
      <div className="page-hero ledger-hero transaction-ledger-hero">
        <div className="ledger-hero__copy">
          <div className="ledger-eyebrow">
            <span><i aria-hidden="true" /> Settlement ledger</span>
            <b>Rialo DevNet</b>
          </div>
          <h1>Settlements</h1>
          <p>Verified payments and refunds, with a receipt for every outcome.</p>
        </div>
        <Link className="transaction-ledger-hero__link" href="/activity">
          <Activity aria-hidden="true" size={16} strokeWidth={1.7} />
          View all activity
        </Link>
      </div>
      <SettlementActivityFeed />
      <section className="settlements-footnote ledger-footnote ledger-footnote--compact">
        <span className="ledger-footnote__icon" aria-hidden="true"><ReceiptText size={17} strokeWidth={1.7} /></span>
        <p>Receipts appear only after a live workflow is verified as paid or refunded. Open a receipt to inspect the recipient, amount, workflow flags, and transaction.</p>
      </section>
    </main>
  );
}
