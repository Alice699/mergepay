import type { Metadata } from "next";
import Link from "next/link";
import { GitPullRequest, Plus } from "lucide-react";
import { OpenBountyFeed } from "@/components/bounty/open-bounty-feed";
import { CopyValue } from "@/components/ui/copy-value";
import { marketplaceDeployment } from "@/lib/deployment";

export const metadata: Metadata = { title: "Bounties" };

export default function BountiesPage() {
  return (
    <main className="page-main page-width liquid-slate-page ledger-page marketplace-page">
      <div className="page-hero ledger-hero marketplace-hero">
        <div className="ledger-hero__copy marketplace-hero__copy">
          <div className="ledger-eyebrow marketplace-eyebrow">
            <span>
              <i aria-hidden="true" /> Bounty marketplace
            </span>
            <b>DevNet / Live discovery</b>
          </div>
          <h1>
            <span>Work with</span>
            <em>clear terms.</em>
          </h1>
          <p>Sponsors publish a PR, contributors prove authorship, and Rialo locks the payout wallet before funding. Each bounty remains an auditable onchain workflow.</p>
        </div>
        <aside className="marketplace-hero__action" aria-label="Create a new bounty">
          <div className="marketplace-hero__action-head">
            <div className="marketplace-hero__action-icon" aria-hidden="true">
              <GitPullRequest size={20} strokeWidth={1.6} />
            </div>
            <span><i aria-hidden="true" /> Sponsor flow</span>
          </div>
          <div className="marketplace-hero__action-body">
            <span>NEW WORKFLOW</span>
            <strong>Publish a bounty.</strong>
            <p>Commit the repository, pull request, reward, and deadline before funding.</p>
            <Link className="button" href="/bounties/new">
              Post a bounty
              <Plus aria-hidden="true" className="ui-icon" size={16} strokeWidth={2} />
            </Link>
          </div>
        </aside>
      </div>
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
