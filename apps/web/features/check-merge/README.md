# Check Merge

This feature owns the sponsor fallback for the native autonomous REX path:

- re-read the workflow from Rialo before signing;
- require the exact on-chain sponsor, funded state, and an active deadline;
- build and submit the generated merge-check callback instruction when the sponsor
  wants an immediate check;
- derive the next async branch from the first field of the on-chain workflow
  state, because native timers also consume branches;
- use a fresh subscription/REX pair for every retry, so consumed one-shot REX
  resources are never reused;
- wait for root transaction confirmation without treating it as merge proof;
- poll Rialo workflow lineage for the asynchronous callback;
- refresh the decoded workflow and report paid, no-payout, callback-failed, or
  still-pending outcomes without consulting a trusted application backend.

The browser never decides whether a pull request is merged. GitHub is queried by
Rialo REX, and the UI calls a bounty paid only after the decoded workflow account
contains both `merge_confirmed=true` and `paid=true`.

The primary path is now registered by `fund`: Rialo starts a one-shot settlement
heartbeat, and each `run_merge_check` handler re-arms the next short native timer.
The heartbeat checks the deadline on every pass but only starts a GitHub REX request
every 30 seconds. It stops harmlessly when `paid` or `refunded` is terminal, and a
deadline response cannot race refund because the callback rejects post-deadline
merge proofs.
