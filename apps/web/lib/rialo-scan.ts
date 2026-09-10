const RIALO_SCAN_APP_URL = "https://www.rialoscans.xyz/app/";

export function getRialoScanTransactionUrl(signature: string): string {
  const url = new URL(RIALO_SCAN_APP_URL);
  url.searchParams.set("search", signature);
  return url.toString();
}
