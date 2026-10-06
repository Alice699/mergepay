import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CircleAlert, GitPullRequest } from "lucide-react";
import { CreateBountyForm } from "@/features/create-bounty/components/create-bounty-form";
import { generateWorkflowSlug } from "@/lib/validation";

export const metadata: Metadata = { title: "Create bounty" };

export default function CreateBountyPage() {
  return (
    <main className="page-main page-width liquid-slate-page ledger-page bounty-flow-page bounty-create-page bounty-workspace-page">
      <div className="page-hero ledger-hero bounty-flow-hero bounty-create-hero">
        <div className="ledger-hero__copy bounty-flow-hero__copy">
          <div className="ledger-eyebrow bounty-flow-eyebrow">
            <span>
              <i aria-hidden="true" /> New workflow
            </span>
            <b>Sponsor · DevNet</b>
          </div>
          <h1>Create a bounty</h1>
          <p>Choose a public pull request and lock the terms. Fund the reward after approving the contributor.</p>
        </div>
        <Link className="bounty-back-link" href="/bounties"><GitPullRequest aria-hidden="true" size={15} /> All bounties</Link>
      </div>
      <div className="form-layout bounty-create__layout">
        <CreateBountyForm initialWorkflowSlug={generateWorkflowSlug()} />
        <aside className="panel terms-panel bounty-create__terms">
          <div className="bounty-create__terms-head">
            <h2>After creation</h2>
            <span>From claim to settlement</span>
            <Link className="bounty-create__guide" href="/guide"><BookOpen aria-hidden="true" size={14} /> Step-by-step guide</Link>
          </div>
          <ol aria-label="After creation steps">
            <li><span>01</span><div><h3>Share the bounty</h3><p>The PR author verifies their GitHub identity and claims the bounty with a wallet.</p></div></li>
            <li><span>02</span><div><h3>Approve the contributor</h3><p>Review the claim and lock the contributor’s receiving wallet.</p></div></li>
            <li><span>03</span><div><h3>Fund the escrow</h3><p>Deposit the exact reward. Funding starts autonomous settlement.</p></div></li>
            <li><span>04</span><div><h3>Rialo settles</h3><p>Valid onchain proof before expiry pays the contributor. Otherwise, escrow is refunded.</p></div></li>
          </ol>
          <p className="bounty-create__devnet"><CircleAlert aria-hidden="true" size={16} /><span><strong>DevNet only.</strong> Unaudited software; do not use production funds.</span></p>
        </aside>
      </div>
    </main>
  );
}
