import type { Metadata } from "next";
import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { SettlementReceipt } from "@/components/bounty/settlement-receipt";
import { CopyValue } from "@/components/ui/copy-value";
import { routes } from "@/lib/constants";
import { isWorkflowSlug } from "@/lib/validation";

export const metadata: Metadata = {
  title: "Settlement receipt",
  description:
    "Verify a MergePay payout or refund directly from its Rialo workflow account.",
};

export default async function SettlementReceiptPage({
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

  return (
    <main className="page-main page-width liquid-slate-page ledger-page bounty-flow-page bounty-receipt-page settlement-page">
      <div className="page-hero ledger-hero bounty-flow-hero bounty-receipt-hero page-hero--receipt">
        <div className="ledger-hero__copy bounty-flow-hero__copy">
          <div className="ledger-eyebrow bounty-flow-eyebrow">
            <span><i aria-hidden="true" /> Onchain settlement proof</span>
            <b>Paid / Refunded</b>
          </div>
          <h1>
            <span>Know where</span>
            <em>the bounty went.</em>
          </h1>
          <p>
            Paid and refunded receipts are decoded from the exact Rialo workflow
            account. The amount and destination remain visible even when the
            wallet balance change is easy to miss.
          </p>
        </div>
        {valid ? (
          <aside className="bounty-flow-hero__card settlement-page__identity" aria-label="Settlement workflow identifier">
            <div className="bounty-flow-hero__card-head">
              <span className="bounty-flow-hero__card-icon" aria-hidden="true">
                <ReceiptText size={20} strokeWidth={1.6} />
              </span>
              <span className="bounty-flow-hero__card-state"><i aria-hidden="true" /> Proof ready</span>
            </div>
            <div className="bounty-flow-hero__card-body">
              <span>WORKFLOW ID</span>
              <CopyValue value={slug} />
              <p>Rialo DevNet · live account read</p>
            </div>
          </aside>
        ) : (
          <Link className="button" href={routes.bounties}>
            Back to bounties
          </Link>
        )}
      </div>

      {valid ? (
        <SettlementReceipt
          slug={slug}
          sponsorHint={sponsor}
          workflowAddressHint={account}
        />
      ) : (
        <section className="panel settlement-receipt-state" data-tone="error">
          <p className="eyebrow">Invalid workflow</p>
          <h2>This receipt cannot be verified.</h2>
          <p>MergePay workflow IDs must contain exactly 64 hexadecimal characters.</p>
          <Link className="button" href={routes.bounties}>
            Browse bounties
          </Link>
        </section>
      )}
    </main>
  );
}
