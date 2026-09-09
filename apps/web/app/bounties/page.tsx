import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { OpenBountyFeed } from "@/components/bounty/open-bounty-feed";
import { CopyValue } from "@/components/ui/copy-value";
import { marketplaceDeployment } from "@/lib/deployment";

export const metadata: Metadata = { title: "Bounties" };

export default function BountiesPage() {
  return (
    <main className="page-main page-width">
      <div className="page-hero"><div><p className="eyebrow">GitHub bounty marketplace</p><h1>Work with<br />clear terms.</h1><p>Sponsors publish a PR, contributors prove authorship, and Rialo locks the payout wallet before funding. Each bounty remains an auditable onchain workflow.</p></div><Link className="button" href="/bounties/new">Post a bounty <Plus aria-hidden="true" className="ui-icon" size={16} strokeWidth={2} /></Link></div>
      <div className="content-grid content-grid--marketplace">
        <OpenBountyFeed />
        <aside className="panel readiness-panel readiness-panel--marketplace">
          <div className="readiness-panel__header">
            <p className="panel-label">DATA READINESS</p>
            <span className="state state--good">Live</span>
          </div>
          <ul>
            <li><span>Network</span><strong className="state state--good">DevNet</strong></li>
            <li><span>Marketplace program</span><CopyValue value={marketplaceDeployment.programId} /></li>
            <li><span>Autonomous settlement</span><strong className="state state--good">Runtime-proven</strong></li>
            <li><span>Account decoder</span><strong className="state state--good">Live on-chain</strong></li>
          </ul>
          <p className="panel-note">Discovery reads verified Rialo accounts. The active DevNet program handles merged-PR payout and deadline refund autonomously.</p>
        </aside>
      </div>
    </main>
  );
}
