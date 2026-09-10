import { redirect } from "next/navigation";
import { routes } from "@/lib/constants";

export const metadata = { title: "Settlement receipt" };

export default async function LegacySettlementReceiptRoute({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { slug } = await params;
  const query = searchParams ? await searchParams : {};
  const nextQuery = new URLSearchParams();

  for (const key of ["account", "sponsor", "tx"]) {
    const value = query[key];
    if (typeof value === "string") nextQuery.set(key, value);
  }

  const target = routes.settlementReceipt(slug);
  redirect(nextQuery.toString() ? `${target}?${nextQuery.toString()}` : target);
}
