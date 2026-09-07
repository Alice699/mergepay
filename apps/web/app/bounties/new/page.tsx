import type { Metadata } from "next";
import { CreateBountyForm } from "@/features/create-bounty/components/create-bounty-form";
import { generateWorkflowSlug } from "@/lib/validation";

export const metadata: Metadata = { title: "Create bounty" };

export default function CreateBountyPage() {
  return (
    <main className="page-main page-width">
      <div className="page-hero page-hero--form"><div><p className="eyebrow">New workflow</p><h1>Define the<br />settlement.</h1></div><p>Creation and funding are separate onchain transactions. Review every immutable term before signing.</p></div>
      <div className="form-layout"><CreateBountyForm initialWorkflowSlug={generateWorkflowSlug()} /><aside className="panel terms-panel"><p className="panel-label">BEFORE YOU CONTINUE</p><ol><li><span>1</span><p><strong>Public repository only</strong>GitHub author proof uses the public pull request endpoint.</p></li><li><span>2</span><p><strong>Contributor claims</strong>The PR author connects a wallet and submits a signed claim request.</p></li><li><span>3</span><p><strong>Sponsor approval</strong>The sponsor locks the beneficiary before funding escrow.</p></li><li><span>4</span><p><strong>DevNet software</strong>MergePay is unaudited and not for production funds.</p></li></ol></aside></div>
    </main>
  );
}
