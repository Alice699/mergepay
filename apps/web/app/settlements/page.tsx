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
    <main className="page-main page-width settlements-page">
      <div className="page-hero">
        <div>
          <p className="eyebrow">Wallet-scoped settlement history</p>
          <h1>
            Paid or returned.
            <br />
            Never guess.
          </h1>
          <p>
            This page shows only terminal bounty outcomes involving the active
            wallet: a confirmed payment to a contributor or an escrow refund to
            a sponsor. Every row is checked against its live Rialo workflow.
          </p>
        </div>
        <div className="settlement-scope" aria-label="Live settlement source">
          <ReceiptText aria-hidden="true" size={20} strokeWidth={1.6} />
          <span>LIVE SETTLEMENTS</span>
          <strong>Connected wallet</strong>
          <small>Rialo DevNet</small>
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
