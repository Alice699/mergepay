# Security and Limitations

MergePay is a DevNet MVP, not audited production software.

## Security invariants

- The sponsor pubkey is committed at creation.
- An open bounty starts with the zero pubkey sentinel and cannot be funded until a
  sponsor-approved contributor claim assigns a beneficiary.
- A contributor claim is derived from the contributor payer, points to one sponsor-owned
  target, and copies no terms into the main bounty until the sponsor approves it.
- Claim approval rechecks the target address, sponsor, repository, PR number, amount,
  deadline, beneficiary, and bounded GitHub login before locking the payout wallet.
- Sponsor-only controls compare the current payer against committed state.
- The reactive handler also requires the callback payer to match the committed sponsor.
- The payout account pubkey must match the committed beneficiary.
- The beneficiary account is writable but is not required to sign the callback.
- Payout requires a non-empty, unanimous successful REX report.
- Unanimous HTTP `404`, mixed reports, unsupported outputs, and REX errors do not pay.
- `paid` and `refunded` terminal flags prevent a second escrow release.
- Payout/refund release only the committed escrow amount; any remaining workflow
  balance stays available for the PDA's state/rent reserve.
- Payout and refund explicitly require the workflow account to be program-owned.
- Arithmetic that combines rent and escrow uses checked addition.
- Escrow debit and recipient credit use checked arithmetic.
- GitHub owner/repository fields accept only bounded ASCII slug characters.
- Deadlines reject negative chain time before conversion to `u64`.
- `fund` accepts only a DKG-encrypted GitHub App authorization envelope. The
  envelope is bound to the sponsor public key and the plaintext token is never
  written to source, browser storage, logs, or a workflow response.

## Trust assumptions

- Rialo DevNet, its REX validators, registry, and subscriber programs behave according
  to the tested `0.18.1` release.
- GitHub's public merge-status endpoint accurately represents public repository state.
- The sponsor chooses the intended repository, PR, amount, and deadline, then reviews the
  contributor claim before funding.
- Contributor claims require GitHub OAuth. The server compares the authenticated
  numeric GitHub user ID with the author ID returned for the exact public pull request;
  a typed username is not accepted as identity proof. The claim record stores the
  canonical login and numeric ID alongside the receiving Rialo wallet.
- OAuth remains an off-chain identity boundary: Rialo cannot call GitHub from inside the
  program. Sponsor approval is still required and must review the exact PR, identity,
  and wallet before funding.
- The funding route mints a short-lived, read-only GitHub App installation token on
  demand from server-only `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, and
  `GITHUB_APP_PRIVATE_KEY` credentials. It encrypts the exact GitHub merge URL and
  `Authorization` header for REX, and returns only a packed DKG envelope. The
  ciphertext itself is public workflow state; plaintext is available only to the REX
  decryption path.
- DevNet transaction history and deployments may be reset.
- The embedded wallet runs in the same browser origin as the dApp. While unlocked, an
  origin compromise or malicious dependency could access signing capability; encrypted
  storage protects data at rest, not a compromised runtime.
- The same-origin RPC relay is a transport boundary, not a signer. It forwards only an
  explicit method allowlist to a fixed HTTPS endpoint and never receives passwords or
  private keys; signed transaction bytes and public addresses remain public network data.
- Production GitHub OAuth requires an explicitly configured HTTPS callback at the exact
  `/api/github/auth/callback` path. Request-derived callbacks are limited to local
  development so a forwarded host cannot silently change the registered OAuth origin.
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
- The marketplace claim instructions are deployed at the recorded marketplace program,
  but the claim, funding, payout, and refund E2E flow is not runtime-proven yet.
- Native RLO escrow only; no token interface yet.
- One sponsor, one approved beneficiary, one PR, and one fixed amount per workflow.
- One claim record can be approved for a bounty in the current MVP; replacing or
  rejecting a submitted claim needs an explicit protocol instruction before funding.
- The current source candidate arms native merge polling and deadline refund through
  `AFTER`, but this candidate is not yet DevNet-proven. Until its E2E lineage is
  recorded, users should treat sponsor-triggered actions as the reliable fallback path.
- The native timestamp subscription currently receives an active window of roughly 100
  commits. The candidate re-arms merge polling every 30 seconds, but do not treat the
  local build as a 100% autonomous liveness guarantee until the deployed lineage proves
  both terminal paths.
- The current PR and merge proof paths target public repositories only. GitHub OAuth
  access tokens are exchanged and used server-side for identity lookup, never stored in
  the browser session or exposed to the client.
- Each new funding request mints a fresh GitHub App installation token automatically;
  the server refreshes its cache before expiry and never exposes the token to the
  browser. An already-funded workflow still contains the encrypted token snapshot from
  its funding transaction and cannot be retrofitted without a protocol instruction.
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
- GitHub App token rotation for already-funded workflows, private-repository policy,
  and production secret-operations design.
- Version-gated clock semantics.
- Production-grade wallet integration, independent wallet audit, phishing resistance,
  hardware-backed key custody, and recovery UX.
