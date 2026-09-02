# Security and Limitations

MergePay is a DevNet MVP, not audited production software.

## Security invariants

- The sponsor pubkey is committed at creation.
- Sponsor-only controls compare the current payer against committed state.
- The reactive handler also requires the callback payer to match the committed sponsor.
- The payout account pubkey must match the committed beneficiary.
- The beneficiary account is writable but is not required to sign the callback.
- Payout requires a non-empty, unanimous successful REX report.
- Unanimous HTTP `404`, mixed reports, unsupported outputs, and REX errors do not pay.
- `paid` and `refunded` terminal flags prevent a second escrow release.
- Payout/refund preserve the workflow PDA's rent reserve.
- Payout and refund explicitly require the workflow account to be program-owned.
- Arithmetic that combines rent and escrow uses checked addition.
- Escrow debit and recipient credit use checked arithmetic.
- GitHub owner/repository fields accept only bounded ASCII slug characters.
- Deadlines reject negative chain time before conversion to `u64`.

## Trust assumptions

- Rialo DevNet, its REX validators, registry, and subscriber programs behave according
  to the tested `0.18.1` release.
- GitHub's public merge-status endpoint accurately represents public repository state.
- The sponsor chooses the intended repository, PR, beneficiary, amount, and deadline.
- DevNet transaction history and deployments may be reset.
- The embedded wallet runs in the same browser origin as the dApp. While unlocked, an
  origin compromise or malicious dependency could access signing capability; encrypted
  storage protects data at rest, not a compromised runtime.
- The same-origin RPC relay is a transport boundary, not a signer. It forwards only an
  explicit method allowlist to a fixed HTTPS endpoint and never receives passwords or
  private keys; signed transaction bytes and public addresses remain public network data.
- Users retain the wallet password and encrypted backup. MergePay has no recovery key.

## Fail-closed behavior

The program pays only when every report output is `RexOutput::Success`. A `404` is
treated as not merged and keeps escrow locked. Any other HTTP error, malformed output,
empty report, or validator disagreement also leaves funds locked for a later retry or
post-deadline refund.

For a public GitHub repository, `404` can also mean that the repository/PR is missing
or inaccessible. That ambiguity cannot create a payout; it only keeps the
sponsor-selected bounty locked until refund.

## Known limitations

- DevNet only; no security audit.
- Native RLO escrow only; no token interface yet.
- One sponsor, one beneficiary, one PR, and one fixed amount per workflow.
- The sponsor manually starts each merge check. The callback itself is reactive and
  automatic, but the MVP does not periodically poll GitHub.
- Public GitHub data only. No secret API token is stored or sent.
- GitHub unauthenticated rate limits can make a check inconclusive.
- Deadline values use milliseconds because that is the observed DevNet `0.18.1` clock
  unit. Revalidate this assumption when upgrading Rialo.
- Workflow rent remains in the PDA after payout/refund; there is no close instruction.
- CLI submission can print a transaction signature even when execution fails. Always
  inspect transaction metadata and require a successful status.
- The embedded signer is DevNet-only. It rejects other networks, other program IDs,
  non-public MergePay instruction discriminants, and signer mismatches.
- Browser storage can be cleared by the user or browser. Without the encrypted backup
  and its password, the local DevNet account cannot be recovered.
- The public DevNet RPC and faucet may be restarted, reset, or rate-limited independently
  of the dApp. The UI reports RPC reachability rather than claiming the whole network is
  offline.

## Operational guidance

- Never commit Rialo keypair files or private keys.
- Never use the embedded DevNet wallet with real funds or copy a production key into it.
- Download an encrypted backup before creating a workflow that must survive a browser
  reset, and lock the wallet when signing is complete.
- Treat all instruction arguments and transaction logs as public.
- Revalidate mutable GitHub fixtures immediately before demos.
- Follow the full workflow lineage and inspect the callback, not only the initiating
  transaction.
- Re-run macro expansion review after changing callback parameters or Rialo versions.

## Production work still required

- Independent audit and adversarial test suite.
- Explicit workflow close/rent recovery policy.
- Token support and decimal-safe UI amounts.
- Rate-limit strategy, retries, and optional authenticated/private-repository design.
- Version-gated clock semantics.
- Production-grade wallet integration, independent wallet audit, phishing resistance,
  hardware-backed key custody, and recovery UX.
