import type { Metadata } from "next";
import Link from "next/link";
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
    <main className="page-main page-width">
      <div className="page-hero page-hero--detail"><div><p className="eyebrow">Workflow detail</p><h1>{valid ? "Onchain state." : "Invalid workflow."}</h1><p>{valid ? "Transaction status and workflow fields are read directly from Rialo. Nothing is guessed or synthesized." : "MergePay workflow IDs must contain exactly 64 hexadecimal characters."}</p></div>{valid ? <CopyValue value={slug} /> : <Link className="button" href="/bounties">Back to bounties</Link>}</div>
      {valid ? <WorkflowDetail callbackSignature={callbackSignature} claimWorkflowHint={claimWorkflow} slug={slug} sponsorHint={sponsor} transactionKind={transactionKind} transactionSignature={transactionSignature} workflowAddressHint={account} /> : null}
      <section className="section detail-lifecycle"><div className="section-heading"><p className="eyebrow">Protocol lifecycle</p><h2>How a verified record moves.</h2><p>This describes contract behavior, not the unverified state of the requested workflow.</p></div><WorkflowLifecycle /></section>
    </main>
  );
}
