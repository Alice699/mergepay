import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, GitPullRequest } from "lucide-react";
import { WorkflowDetail } from "@/components/bounty/workflow-detail";
import { WorkflowLifecycle } from "@/components/bounty/workflow-lifecycle";
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
    <main className="page-main page-width liquid-slate-page ledger-page bounty-flow-page bounty-detail-page bounty-workspace-page">
      <div className="page-hero ledger-hero bounty-flow-hero bounty-detail-hero">
        <div className="ledger-hero__copy bounty-flow-hero__copy">
          <div className="ledger-eyebrow bounty-flow-eyebrow">
            <span>
              <i aria-hidden="true" /> Bounty overview
            </span>
            <b>{valid ? "DevNet · Live account" : "Invalid identifier"}</b>
          </div>
          <h1>{valid ? "Bounty details" : "Invalid workflow"}</h1>
          <p>{valid ? "Track the reward, deadline, and next step from the verified Rialo account." : "MergePay workflow IDs must contain exactly 64 hexadecimal characters."}</p>
        </div>
        <Link className="bounty-back-link" href="/bounties"><GitPullRequest aria-hidden="true" size={15} /> All bounties</Link>
      </div>
      {valid ? <WorkflowDetail callbackSignature={callbackSignature} claimWorkflowHint={claimWorkflow} slug={slug} sponsorHint={sponsor} transactionKind={transactionKind} transactionSignature={transactionSignature} workflowAddressHint={account} /> : null}
      <details className="bounty-disclosure detail-lifecycle">
        <summary><span>About the workflow</span><ChevronDown aria-hidden="true" size={16} /></summary>
        <div className="bounty-disclosure__body"><div className="section-heading"><p className="eyebrow">Protocol lifecycle</p><h2>From claim to settlement</h2><p>This is the protocol flow, not the current state of this bounty.</p></div><WorkflowLifecycle /></div>
      </details>
    </main>
  );
}
