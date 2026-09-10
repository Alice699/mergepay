import type { Metadata } from "next";
import { Activity } from "lucide-react";
import Link from "next/link";
import { WalletActivityFeed } from "@/components/activity/wallet-activity-feed";
import { marketplaceDeployment } from "@/lib/deployment";

export const metadata: Metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    <main className="page-main page-width liquid-slate-page ledger-page activity-page">
      <div className="page-hero ledger-hero">
        <div className="ledger-hero__copy">
          <div className="ledger-eyebrow">
            <span>
              <i aria-hidden="true" /> Onchain ledger
            </span>
            <b>DevNet / Wallet scoped</b>
          </div>
          <h1>
            <span>Every action,</span>
            <em>in context.</em>
          </h1>
          <p>See what the connected wallet has actually done on Rialo DevNet. Activity is read from the chain, scoped to one address, and never filled with sample records.</p>
        </div>
        <div className="activity-scope ledger-scope" aria-label="Live activity source">
          <div className="ledger-scope__head">
            <div className="ledger-scope__icon" aria-hidden="true">
              <Activity size={20} strokeWidth={1.6} />
            </div>
            <span><i aria-hidden="true" /> Live source</span>
          </div>
          <div className="ledger-scope__body">
            <span>TRANSACTION SCOPE</span>
            <strong>Connected wallet</strong>
            <small>Rialo DevNet · newest first</small>
          </div>
        </div>
      </div>
      <WalletActivityFeed />
      <section className="activity-footnote">
        <div>
          <p className="panel-label">CURRENT PROGRAM</p>
          <p>MergePay transactions are decoded against the active autonomous-settlement ABI <span className="mono">{marketplaceDeployment.programId}</span>. Open a workflow record for its escrow state, beneficiary, deadline, and REX outcome. Need only the final money movement? <Link href="/settlements">Open settlement history</Link>.</p>
        </div>
        <span className="state state--good">Live data only</span>
      </section>
    </main>
  );
}
