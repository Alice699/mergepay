import type { MergePayActivityItem } from "@mergepay/rialo-client";

export type WalletActivityEntry =
  | { kind: "transaction"; item: MergePayActivityItem }
  | { kind: "merge-checks"; items: MergePayActivityItem[] };

/** Presentation only: group adjacent checks on this page, preserving every record. */
export function groupWalletActivity(
  items: readonly MergePayActivityItem[],
): WalletActivityEntry[] {
  const entries: WalletActivityEntry[] = [];

  for (const item of items) {
    const previous = entries.at(-1);
    const canGroup = item.action === "check_merge" &&
      item.status === "confirmed" && item.rexSignal !== "inconclusive" && Boolean(item.workflowAddress);

    if (canGroup && previous?.kind === "merge-checks" &&
      previous.items[0]?.workflowAddress === item.workflowAddress) {
      previous.items.push(item);
    } else if (canGroup && previous?.kind === "transaction" &&
      previous.item.action === "check_merge" &&
      previous.item.status === "confirmed" &&
      previous.item.rexSignal !== "inconclusive" &&
      previous.item.workflowAddress === item.workflowAddress) {
      entries[entries.length - 1] = {
        kind: "merge-checks",
        items: [previous.item, item],
      };
    } else {
      entries.push({ kind: "transaction", item });
    }
  }

  return entries;
}
