const RIALO_SCAN_APP_URL = "https://www.rialoscans.xyz/app/";

export function getRialoScanSearchUrl(value: string): string {
  const url = new URL(RIALO_SCAN_APP_URL);
  url.searchParams.set("search", value);
  return url.toString();
}

export function getRialoScanTransactionUrl(signature: string): string {
  return getRialoScanSearchUrl(signature);
}
