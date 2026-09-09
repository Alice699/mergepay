import type { Metadata } from "next";
import Link from "next/link";
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
    <main className="page-main page-width settlement-page">
      <div className="page-hero page-hero--receipt">
        <div>
          <p className="eyebrow">Onchain settlement proof</p>
          <h1>
            Know where
            <br />
            the bounty went.
          </h1>
          <p>
            Paid and refunded receipts are decoded from the exact Rialo workflow
            account. The amount and destination remain visible even when the
            wallet balance change is easy to miss.
          </p>
        </div>
        {valid ? (
          <div className="settlement-page__identity">
            <span>WORKFLOW ID</span>
            <CopyValue value={slug} />
            <small>Rialo DevNet · live account read</small>
          </div>
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
