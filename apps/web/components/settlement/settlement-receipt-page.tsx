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
            <b>Rialo DevNet</b>
          </div>
          <h1>Settlement receipt</h1>
          <p>
            The final amount, destination, and workflow state—read directly from Rialo.
          </p>
        </div>
        <Link className="button button--dark" href={routes.settlements}>
          <ReceiptText aria-hidden="true" size={16} /> Back to settlements
        </Link>
      </div>

      {valid && identifier && (
        <div className="settlement-page__identity" aria-label="Settlement workflow identifier">
          <span>{slug ? "Workflow ID" : "Workflow account"}</span>
          <CopyValue value={identifier} />
          <small>Workflow account read · not a balance estimate</small>
        </div>
      )}

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
