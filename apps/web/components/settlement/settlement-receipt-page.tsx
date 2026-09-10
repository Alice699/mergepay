import { ReceiptText } from "lucide-react";
import Link from "next/link";
import { SettlementReceipt } from "@/components/bounty/settlement-receipt";
import { CopyValue } from "@/components/ui/copy-value";
import { routes } from "@/lib/constants";
import { isWorkflowSlug } from "@/lib/validation";

interface SettlementReceiptPageProps {
  slug: string | null;
  account: string | null;
  sponsor: string | null;
  transactionSignature: string | null;
}

export function SettlementReceiptPage({
  slug,
  account,
  sponsor,
  transactionSignature,
}: Readonly<SettlementReceiptPageProps>) {
  const identifier = slug ?? account;
  const valid = Boolean(identifier && (!slug || isWorkflowSlug(slug)));

  return (
    <main className="page-main page-width liquid-slate-page ledger-page bounty-flow-page bounty-receipt-page settlements-page settlement-detail-page">
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
        {valid && identifier ? (
          <aside className="bounty-flow-hero__card settlement-page__identity" aria-label="Settlement workflow identifier">
            <div className="bounty-flow-hero__card-head">
              <span className="bounty-flow-hero__card-icon" aria-hidden="true">
                <ReceiptText size={20} strokeWidth={1.6} />
              </span>
              <span className="bounty-flow-hero__card-state"><i aria-hidden="true" /> Proof ready</span>
            </div>
            <div className="bounty-flow-hero__card-body">
              <span>{slug ? "WORKFLOW ID" : "WORKFLOW ACCOUNT"}</span>
              <CopyValue value={identifier} />
              <p>Rialo DevNet · live account read</p>
            </div>
          </aside>
        ) : (
          <Link className="button" href={routes.settlements}>
            Back to settlements
          </Link>
        )}
      </div>

      {valid ? (
        <SettlementReceipt
          slug={slug}
          sponsorHint={sponsor}
          transactionSignatureHint={transactionSignature}
          workflowAddressHint={account}
        />
      ) : (
        <section className="panel settlement-receipt-state" data-tone="error">
          <p className="eyebrow">Missing workflow account</p>
          <h2>This receipt cannot be verified.</h2>
          <p>Open a receipt from the settlement ledger so MergePay can read the exact Rialo workflow account.</p>
          <Link className="button" href={routes.settlements}>
            Back to settlements
          </Link>
        </section>
      )}
    </main>
  );
}
