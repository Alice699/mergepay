import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { WorkflowLookup } from "@/components/bounty/workflow-lookup";
import { devnetDeployment, hardenedDeploymentReady } from "@/lib/deployment";

export const metadata: Metadata = { title: "Bounties" };

export default function BountiesPage() {
  return (
    <main className="page-main page-width">
      <div className="page-hero"><div><p className="eyebrow">Bounty registry</p><h1>Onchain<br />workflows.</h1><p>Only workflows returned by Rialo will appear here. MergePay does not fill this view with sample records.</p></div><Link className="button" href="/bounties/new">Create bounty <Plus aria-hidden="true" className="ui-icon" size={16} strokeWidth={2} /></Link></div>
      <div className="content-grid">
        <section className="panel panel--empty">
          <div className="empty-signal"><span /><span /><span /></div>
          <p className="eyebrow">Read path unavailable</p>
          <h2>No fabricated bounties.</h2>
          <p>The Rialo RPC account decoder is not connected yet, so this index cannot truthfully claim which workflows currently exist.</p>
          <WorkflowLookup />
        </section>
        <aside className="panel readiness-panel">
          <p className="panel-label">DATA READINESS</p>
          <ul>
            <li><span>Network</span><strong className="state state--good">DevNet</strong></li>
            <li><span>Tested program</span><strong className="mono">{devnetDeployment.reviewCandidate.programId.slice(0, 6)}…{devnetDeployment.reviewCandidate.programId.slice(-6)}</strong></li>
            <li><span>Hardened program</span><strong className={`state ${hardenedDeploymentReady ? "state--good" : "state--warn"}`}>{hardenedDeploymentReady ? "Runtime-proven" : "Pending"}</strong></li>
            <li><span>Account decoder</span><strong className="state">Unavailable</strong></li>
          </ul>
          <p className="panel-note">This state is intentional: unavailable data is shown as unavailable, never replaced with mock content.</p>
        </aside>
      </div>
    </main>
  );
}
