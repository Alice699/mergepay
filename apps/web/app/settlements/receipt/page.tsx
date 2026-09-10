import type { Metadata } from "next";
import { SettlementReceiptPage } from "@/components/settlement/settlement-receipt-page";

export const metadata: Metadata = {
  title: "Settlement receipt",
  description:
    "Verify a MergePay payout or refund from its decoded Rialo workflow account.",
};

export default async function AccountSettlementReceiptRoute({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const query = searchParams ? await searchParams : {};

  return (
    <SettlementReceiptPage
      account={typeof query.account === "string" ? query.account : null}
      slug={null}
      sponsor={typeof query.sponsor === "string" ? query.sponsor : null}
      transactionSignature={typeof query.tx === "string" ? query.tx : null}
    />
  );
}
