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
            <span>What happens next</span>
          </div>
          <ol>
            <li><span>1</span><p><strong>Share the bounty</strong>The PR author verifies their GitHub identity and submits a wallet claim.</p></li>
            <li><span>2</span><p><strong>Approve the contributor</strong>You review the claim and lock the receiving wallet.</p></li>
            <li><span>3</span><p><strong>Fund the escrow</strong>Deposit the exact reward to start autonomous settlement.</p></li>
            <li><span>4</span><p><strong>Rialo settles</strong>Valid proof before the deadline pays the contributor. Otherwise, expired escrow is refunded.</p></li>
          </ol>
          <p className="bounty-create__devnet"><CircleAlert aria-hidden="true" size={16} /> DevNet only. Unaudited software; do not use production funds.</p>
          <Link className="bounty-create__guide" href="/guide"><BookOpen aria-hidden="true" size={14} /> Read the step-by-step guide</Link>
        </aside>
      </div>
    </main>
  );
}
