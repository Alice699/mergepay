import type { Metadata } from "next";
import Link from "next/link";
import { WorkflowLifecycle } from "@/components/bounty/workflow-lifecycle";
import { CopyValue } from "@/components/ui/copy-value";
import { isWorkflowSlug } from "@/lib/validation";

export const metadata: Metadata = { title: "Bounty details" };

export default async function BountyDetailPage({
  params,
}: Readonly<{ params: Promise<{ slug: string }> }>) {
  const { slug } = await params;
  const valid = isWorkflowSlug(slug);

  return (
    <main className="page-main page-width">
      <div className="page-hero page-hero--detail"><div><p className="eyebrow">Workflow detail</p><h1>{valid ? "Onchain state." : "Invalid workflow."}</h1><p>{valid ? "This identifier is valid, but the Rialo account decoder is not connected. No workflow fields are guessed or synthesized." : "MergePay workflow IDs must contain exactly 64 hexadecimal characters."}</p></div>{valid ? <CopyValue value={slug} /> : <Link className="button" href="/bounties">Back to bounties</Link>}</div>
      {valid ? <div className="content-grid">
        <section className="panel panel--empty"><div className="empty-signal"><span /><span /><span /></div><p className="eyebrow">Account read unavailable</p><h2>State withheld until verified.</h2><p>Sponsor, beneficiary, funds, merge status, and deadline will appear only after the client decodes this exact Rialo workflow account.</p></section>
        <aside className="panel readiness-panel"><p className="panel-label">EXPECTED DATA SOURCE</p><ul><li><span>Identifier</span><strong className="state state--good">Valid</strong></li><li><span>Network</span><strong>DevNet</strong></li><li><span>RPC</span><strong className="state">Not configured</strong></li><li><span>Decoder</span><strong className="state">Unavailable</strong></li></ul></aside>
      </div> : null}
      <section className="section detail-lifecycle"><div className="section-heading"><p className="eyebrow">Protocol lifecycle</p><h2>How a verified record moves.</h2><p>This describes contract behavior, not the unverified state of the requested workflow.</p></div><WorkflowLifecycle /></section>
    </main>
  );
}
