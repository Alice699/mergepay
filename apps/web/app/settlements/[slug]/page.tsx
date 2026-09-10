import type { Metadata } from "next";
import { SettlementReceiptPage } from "@/components/settlement/settlement-receipt-page";

export const metadata: Metadata = {
  title: "Settlement receipt",
  description:
    "Verify a MergePay payout or refund directly from its Rialo workflow account.",
};

export default async function SettlementReceiptRoute({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { slug } = await params;
  const query = searchParams ? await searchParams : {};

  return (
    <SettlementReceiptPage
      account={typeof query.account === "string" ? query.account : null}
      slug={slug}
      sponsor={typeof query.sponsor === "string" ? query.sponsor : null}
      transactionSignature={typeof query.tx === "string" ? query.tx : null}
    />
  );
}
