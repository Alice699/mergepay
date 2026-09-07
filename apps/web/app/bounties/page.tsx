import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { OpenBountyFeed } from "@/components/bounty/open-bounty-feed";
import { marketplaceDeployment } from "@/lib/deployment";

export const metadata: Metadata = { title: "Bounties" };

export default function BountiesPage() {
  return (
    <main className="page-main page-width">
      <div className="page-hero"><div><p className="eyebrow">GitHub bounty marketplace</p><h1>Work with<br />clear terms.</h1><p>Sponsors publish a PR, contributors prove authorship, and Rialo locks the payout wallet before funding. Each bounty remains an auditable onchain workflow.</p></div><Link className="button" href="/bounties/new">Post a bounty <Plus aria-hidden="true" className="ui-icon" size={16} strokeWidth={2} /></Link></div>
      <div className="content-grid">
        <OpenBountyFeed />
        <aside className="panel readiness-panel">
          <p className="panel-label">DATA READINESS</p>
          <ul>
            <li><span>Network</span><strong className="state state--good">DevNet</strong></li>
            <li><span>Marketplace program</span><strong className="mono">{marketplaceDeployment.programId.slice(0, 6)}…{marketplaceDeployment.programId.slice(-6)}</strong></li>
            <li><span>Marketplace ABI</span><strong className="state state--warn">Deployed · E2E pending</strong></li>
            <li><span>Account decoder</span><strong className="state state--good">Live on-chain</strong></li>
          </ul>
          <p className="panel-note">Discovery is live from Rialo account data. The marketplace ABI is deployed; claim, approval, funding, and settlement E2E proof is the next handoff.</p>
        </aside>
      </div>
    </main>
  );
}
