import type { Metadata } from "next";
import { Activity, ReceiptText } from "lucide-react";
import Link from "next/link";
import { WalletActivityFeed } from "@/components/activity/wallet-activity-feed";

export const metadata: Metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    <main className="page-main page-width liquid-slate-page ledger-page transaction-ledger-page activity-page">
      <div className="page-hero ledger-hero transaction-ledger-hero">
        <div className="ledger-hero__copy">
          <div className="ledger-eyebrow">
            <span><i aria-hidden="true" /> Wallet ledger</span>
            <b>Rialo DevNet</b>
          </div>
          <h1>Activity</h1>
          <p>Follow wallet transactions, from bounty creation to settlement.</p>
        </div>
        <Link className="transaction-ledger-hero__link" href="/settlements">
          <ReceiptText aria-hidden="true" size={16} strokeWidth={1.7} />
          View settlements
        </Link>
      </div>
      <WalletActivityFeed />
      <section className="activity-footnote ledger-footnote ledger-footnote--compact">
        <span className="ledger-footnote__icon" aria-hidden="true"><Activity size={17} strokeWidth={1.7} /></span>
        <p>Activity records transactions, including failed attempts. <Link href="/settlements">Settlements</Link> shows only verified payments and refunds.</p>
      </section>
    </main>
  );
}
