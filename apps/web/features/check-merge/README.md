# Check Merge

This feature owns the real sponsor-initiated REX path:

- re-read the workflow from Rialo before signing;
- require the exact on-chain sponsor, funded state, and an active deadline;
- build and submit the generated `check_merge` instruction;
- wait for root transaction confirmation without treating it as merge proof;
- poll Rialo workflow lineage for the asynchronous callback;
- refresh the decoded workflow and report paid, no-payout, callback-failed, or
  still-pending outcomes without consulting a trusted application backend.

The browser never decides whether a pull request is merged. GitHub is queried by
Rialo REX, and the UI calls a bounty paid only after the decoded workflow account
contains both `merge_confirmed=true` and `paid=true`.
