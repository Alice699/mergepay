import type { Metadata } from "next";
import { Activity } from "lucide-react";
import { WalletActivityFeed } from "@/components/activity/wallet-activity-feed";
import { devnetDeployment } from "@/lib/deployment";

export const metadata: Metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    <main className="page-main page-width activity-page">
      <div className="page-hero">
        <div>
          <p className="eyebrow">Wallet activity</p>
          <h1>Every action,<br />in context.</h1>
          <p>See what the connected wallet has actually done on Rialo DevNet. Activity is read from the chain, scoped to one address, and never filled with sample records.</p>
        </div>
        <div className="activity-scope" aria-label="Live activity source">
          <Activity aria-hidden="true" size={20} strokeWidth={1.6} />
          <span>LIVE SOURCE</span>
          <strong>Connected wallet</strong>
          <small>Rialo DevNet</small>
        </div>
      </div>
      <WalletActivityFeed />
      <section className="activity-footnote">
        <div>
          <p className="panel-label">CURRENT PROGRAM</p>
          <p>MergePay transactions are recognized against the runtime-proven DevNet program <span className="mono">{devnetDeployment.reviewCandidate.programId}</span>. Open the workflow record for decoded escrow state, beneficiary, deadline, and REX outcome.</p>
        </div>
        <span className="state state--good">Live data only</span>
      </section>
    </main>
  );
}
