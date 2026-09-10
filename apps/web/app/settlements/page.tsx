import type { Metadata } from "next";
import { ReceiptText } from "lucide-react";
import { SettlementActivityFeed } from "@/components/settlement/settlement-activity-feed";

export const metadata: Metadata = {
  title: "Settlements",
  description:
    "See paid and refunded MergePay bounties associated with the connected Rialo wallet.",
};

export default function SettlementsPage() {
  return (
    <main className="page-main page-width liquid-slate-page ledger-page settlements-page">
      <div className="page-hero ledger-hero">
        <div className="ledger-hero__copy">
          <div className="ledger-eyebrow">
            <span>
              <i aria-hidden="true" /> Settlement ledger
            </span>
            <b>DevNet / Terminal only</b>
          </div>
          <h1>
            <span>Paid or returned.</span>
            <em>Never guess.</em>
          </h1>
          <p>
            This page shows only terminal bounty outcomes involving the active
            wallet: a confirmed payment to a contributor or an escrow refund to
            a sponsor. Every row is checked against its live Rialo workflow.
          </p>
        </div>
        <div className="settlement-scope ledger-scope" aria-label="Live settlement source">
          <div className="ledger-scope__head">
            <div className="ledger-scope__icon" aria-hidden="true">
              <ReceiptText size={20} strokeWidth={1.6} />
            </div>
            <span><i aria-hidden="true" /> Auto-refresh</span>
          </div>
          <div className="ledger-scope__body">
            <span>TERMINAL STATES</span>
            <strong>Paid + refunded</strong>
            <small>Connected wallet · Rialo DevNet</small>
          </div>
        </div>
      </div>

      <SettlementActivityFeed />

      <section className="settlements-footnote">
        <div>
          <p className="panel-label">WHAT COUNTS AS FINAL</p>
          <p>
            MergePay does not treat a submitted transaction, toast, or balance
            estimate as payment proof. A settlement appears here only when the
            decoded workflow reports <span className="mono">paid = true</span>{" "}
            or <span className="mono">refunded = true</span>.
          </p>
        </div>
        <span className="state state--good">Verified onchain</span>
      </section>
    </main>
  );
}
