import type { Metadata } from "next";
import { GitPullRequest, LockKeyhole } from "lucide-react";
import { CreateBountyForm } from "@/features/create-bounty/components/create-bounty-form";
import { generateWorkflowSlug } from "@/lib/validation";

export const metadata: Metadata = { title: "Create bounty" };

export default function CreateBountyPage() {
  return (
    <main className="page-main page-width liquid-slate-page ledger-page bounty-flow-page bounty-create-page">
      <div className="page-hero ledger-hero bounty-flow-hero bounty-create-hero">
        <div className="ledger-hero__copy bounty-flow-hero__copy">
          <div className="ledger-eyebrow bounty-flow-eyebrow">
            <span>
              <i aria-hidden="true" /> New workflow
            </span>
            <b>Sponsor / Immutable terms</b>
          </div>
          <h1>
            <span>Define the</span>
            <em>settlement.</em>
          </h1>
          <p>Set the public pull request, exact reward, and deadline once. Rialo preserves those terms as the shared source of truth.</p>
        </div>
        <aside className="bounty-flow-hero__card" aria-label="Bounty creation summary">
          <div className="bounty-flow-hero__card-head">
            <span className="bounty-flow-hero__card-icon" aria-hidden="true">
              <GitPullRequest size={20} strokeWidth={1.6} />
            </span>
            <span className="bounty-flow-hero__card-state"><i aria-hidden="true" /> Sponsor setup</span>
          </div>
          <div className="bounty-flow-hero__card-body">
            <span>CREATE NOW · FUND AFTER CLAIM</span>
            <strong>One agreement, two signatures.</strong>
            <p>Creation records the terms. Funding starts only after the verified contributor wallet is approved.</p>
            <div className="bounty-flow-hero__card-foot">
              <LockKeyhole aria-hidden="true" size={14} strokeWidth={1.7} />
              <span>Terms become immutable onchain</span>
            </div>
          </div>
        </aside>
      </div>
      <div className="form-layout bounty-create__layout">
        <CreateBountyForm initialWorkflowSlug={generateWorkflowSlug()} />
        <aside className="panel terms-panel bounty-create__terms">
          <div className="bounty-create__terms-head">
            <p className="panel-label">BEFORE YOU CONTINUE</p>
            <span><i aria-hidden="true" /> 4 checks</span>
          </div>
          <ol>
            <li><span>1</span><p><strong>Public repository only</strong>GitHub author proof uses the public pull request endpoint.</p></li>
            <li><span>2</span><p><strong>Contributor claims</strong>The PR author connects a wallet and submits a signed claim request.</p></li>
            <li><span>3</span><p><strong>Sponsor approval</strong>The sponsor locks the beneficiary before funding escrow.</p></li>
            <li><span>4</span><p><strong>DevNet software</strong>MergePay is unaudited and not for production funds.</p></li>
          </ol>
        </aside>
      </div>
    </main>
  );
}
