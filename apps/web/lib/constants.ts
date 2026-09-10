export const WORKFLOW_SLUG_HEX_LENGTH = 64;

/** Conservative floor for the 256-byte workflow rent reserve plus transaction fee. */
export const MINIMUM_CREATE_BALANCE_KELVIN = 2_000_000n;

/** Fee headroom added to the exact on-chain bounty amount before funding. */
export const FUND_TRANSACTION_FEE_BUFFER_KELVIN = 100_000n;

export const routes = {
  home: "/",
  bounties: "/bounties",
  createBounty: "/bounties/new",
  activity: "/activity",
  settlements: "/settlements",
  guide: "/guide",
  docs: "/docs",
  bounty: (slug: string) => `/bounties/${encodeURIComponent(slug)}`,
  settlementReceipt: (slug: string) =>
    `/settlements/${encodeURIComponent(slug)}`,
  settlementReceiptByAccount: "/settlements/receipt",
} as const;
