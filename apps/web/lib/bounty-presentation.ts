/** Read-only presentation. These labels never decide transaction eligibility. */
export function formatTimeRemaining(deadlineUnixMs: bigint, nowUnixMs: number): string {
  const remaining = deadlineUnixMs - BigInt(nowUnixMs);
  if (remaining <= 0n) return "Deadline reached";
  const seconds = (remaining + 999n) / 1_000n;
  const days = seconds / 86_400n;
  const hours = (seconds % 86_400n) / 3_600n;
  const minutes = (seconds % 3_600n) / 60n;
  if (days > 0n) return `${days}d ${hours}h left`;
  if (hours > 0n) return `${hours}h ${minutes}m left`;
  if (minutes > 0n) return `${minutes}m ${seconds % 60n}s left`;
  return `${seconds}s left`;
}

export function bountyPresentation({
  paid,
  refunded,
  funded,
  mergeConfirmed,
  claimRequest,
}: Readonly<{
  paid: boolean;
  refunded: boolean;
  funded: boolean;
  mergeConfirmed: boolean;
  claimRequest: boolean;
}>, isUnclaimed: boolean, deadlinePassed: boolean) {
  if (paid) return { label: "Paid", title: "Reward paid", copy: "Rialo verified the settlement proof and released the reward to the approved contributor.", tone: "success" } as const;
  if (refunded) return { label: "Refunded", title: "Escrow refunded", copy: "Rialo returned the bounty reward to the sponsor. This workflow is settled.", tone: "warning" } as const;
  if (deadlinePassed) return { label: funded ? "Refund pending" : "Expired", title: "Deadline reached", copy: funded ? "Payout is closed. Rialo's automatic refund is pending; the sponsor can also request a refund." : "The deadline passed before funding. There is no funded bounty reward to refund.", tone: "warning" } as const;
  if (mergeConfirmed) return { label: "Merge confirmed", title: "Merge proof verified", copy: "The account records a confirmed merge. A payout is final only when the paid state is verified.", tone: "success" } as const;
  if (funded) return { label: "Funded", title: "Watching for settlement", copy: "The reward is in escrow. Rialo checks the locked GitHub conditions and settles automatically.", tone: "success" } as const;
  if (!isUnclaimed) return { label: "Claim approved", title: "Ready for funding", copy: "The contributor wallet is locked. The sponsor can now fund the exact reward.", tone: "neutral" } as const;
  if (claimRequest) return { label: "Claim requested", title: "Claim awaiting approval", copy: "The contributor claim is recorded. Sponsor approval is required before funding.", tone: "neutral" } as const;
  return { label: "Open claim", title: "Waiting for a contributor", copy: "The PR author can verify their GitHub identity and submit a receiving-wallet claim.", tone: "neutral" } as const;
}
