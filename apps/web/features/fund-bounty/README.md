# Fund Bounty

This feature owns the sponsor-only transition from Created to Funded.

- use-fund-bounty.ts re-reads the workflow and sponsor balance before signing,
  builds the generated fund instruction, and waits for executed confirmation.
- components/fund-bounty-action.tsx exposes wallet, network, balance, deadline,
  approval, failure, and confirmation states without optimistic escrow data.
- The workflow detail refreshes from Rialo after confirmation, so Funded appears
  only when the decoded account says it is true.

Instruction construction remains in `@mergepay/rialo-client`.
