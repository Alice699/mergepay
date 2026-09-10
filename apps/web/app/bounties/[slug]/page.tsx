import type { Metadata } from "next";
import Link from "next/link";
import { RadioTower } from "lucide-react";
import { WorkflowDetail } from "@/components/bounty/workflow-detail";
import { WorkflowLifecycle } from "@/components/bounty/workflow-lifecycle";
import { CopyValue } from "@/components/ui/copy-value";
import { isWorkflowSlug } from "@/lib/validation";

export const metadata: Metadata = { title: "Bounty details" };

export default async function BountyDetailPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { slug } = await params;
  const valid = isWorkflowSlug(slug);
  const query = searchParams ? await searchParams : {};
  const sponsor = typeof query.sponsor === "string" ? query.sponsor : null;
  const account = typeof query.account === "string" ? query.account : null;
  const claimWorkflow = typeof query.claim === "string" ? query.claim : null;
  const transactionSignature = typeof query.tx === "string" ? query.tx : null;
  const callbackSignature = typeof query.callback === "string" ? query.callback : null;
  const transactionKind =
    query.event === "claim"
      ? "claim"
      : query.event === "accept_claim"
        ? "accept_claim"
        : query.event === "fund"
      ? "fund"
      : query.event === "check"
        ? "check"
        : query.event === "refund"
          ? "refund"
          : "create";

  return (
    <main className="page-main page-width liquid-slate-page ledger-page bounty-flow-page bounty-detail-page">
      <div className="page-hero ledger-hero bounty-flow-hero bounty-detail-hero">
        <div className="ledger-hero__copy bounty-flow-hero__copy">
          <div className="ledger-eyebrow bounty-flow-eyebrow">
            <span>
              <i aria-hidden="true" /> Workflow detail
            </span>
            <b>{valid ? "DevNet / Live account" : "Invalid identifier"}</b>
          </div>
          <h1>
            <span>{valid ? "Onchain" : "Invalid"}</span>
            <em>{valid ? "state." : "workflow."}</em>
          </h1>
          <p>{valid ? "Follow the verified workflow from contributor claim through funding, autonomous merge checks, and final settlement." : "MergePay workflow IDs must contain exactly 64 hexadecimal characters."}</p>
        </div>
        {valid ? (
          <aside className="bounty-flow-hero__card bounty-detail-hero__identity" aria-label="Workflow identifier">
            <div className="bounty-flow-hero__card-head">
              <span className="bounty-flow-hero__card-icon" aria-hidden="true">
                <RadioTower size={20} strokeWidth={1.6} />
              </span>
              <span className="bounty-flow-hero__card-state"><i aria-hidden="true" /> Live read</span>
            </div>
            <div className="bounty-flow-hero__card-body">
              <span>WORKFLOW ID</span>
              <CopyValue value={slug} />
              <p>Decoded from the exact Rialo account. No cached workflow state.</p>
            </div>
          </aside>
        ) : (
          <Link className="button bounty-detail-hero__back" href="/bounties">Back to bounties</Link>
        )}
      </div>
      {valid ? <WorkflowDetail callbackSignature={callbackSignature} claimWorkflowHint={claimWorkflow} slug={slug} sponsorHint={sponsor} transactionKind={transactionKind} transactionSignature={transactionSignature} workflowAddressHint={account} /> : null}
      <section className="section detail-lifecycle"><div className="section-heading"><p className="eyebrow">Protocol lifecycle</p><h2>How a verified record moves.</h2><p>This describes contract behavior, not the unverified state of the requested workflow.</p></div><WorkflowLifecycle /></section>
    </main>
  );
}
