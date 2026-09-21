# Security and Limitations

MergePay is a DevNet MVP, not audited production software.

## Security invariants

- The sponsor pubkey is committed at creation.
- An open bounty starts with the zero pubkey sentinel and cannot be funded until a
  sponsor-approved contributor claim assigns a beneficiary.
- A contributor claim is derived from the contributor payer, points to one sponsor-owned
  target, and copies no terms into the main bounty until the sponsor approves it.
- Claim approval rechecks the target address, sponsor, repository, PR number, amount,
- deadline, beneficiary, exact head/base, CI/review policy, REX component, and bounded
  GitHub login before locking the payout wallet.
- Create and claim flows require the payer account to be an actual signer. Sponsor-only
  controls compare both the signer and its pubkey against committed state.
- Account parameters are checked against the actual account keys supplied to the
  instruction; an encoded workflow/claim address cannot be silently substituted.
- The reactive handler also requires the callback payer to match the committed sponsor.
- The payout account pubkey must match the committed beneficiary.
- The beneficiary account is writable but is not required to sign the callback.
- Payout requires a non-empty, unanimous successful REX report.
- Every raw REX validator update must deserialize; malformed updates are counted as
  disagreement instead of being filtered out of the quorum.
- The workflow binds new settlement records to the active policy-locked DevNet REX
  bytecode account: `GcTo6NvSBvszmBogd7y4x9NYMG8ACuVrKy6mcYtQSoJK`.
- The strong-proof verifier binds the payout to the exact head SHA, target branch,
  optional CI policy, and current-commit review policy stored in the workflow.
- Unanimous HTTP `404`, mixed reports, unsupported outputs, and REX errors do not pay.
- `paid` and `refunded` terminal flags prevent a second escrow release.
- Payout/refund release only the committed escrow amount; any remaining workflow
  balance stays available for the PDA's state/rent reserve.
- Mutating paths reject impossible flag combinations such as `paid` without
  `merge_confirmed`, or a refunded workflow that is also paid.
- Payout and refund explicitly require the workflow account to be program-owned.
- Arithmetic that combines rent and escrow uses checked addition.
- Escrow debit and recipient credit use checked arithmetic.
- GitHub owner/repository fields accept only bounded ASCII slug characters.
- Deadlines reject negative chain time before conversion to `u64`.
- `prepare_funding` accepts only a bounded, versioned two-part preparation envelope.
  It is submitted atomically before `fund` so workflow storage and rent stabilize
  before the escrow transfer. The active settlement path contains no GitHub token.

## Trust assumptions

- Rialo DevNet, its REX validators, registry, and subscriber programs behave according
  to the tested `0.18.1` release.
- GitHub's public REST responses accurately represent the public repository state used by
  the selected proof policy, including the PR head/base, merge commit, CI, and reviews.
- The sponsor chooses the intended repository, PR, amount, and deadline, then reviews the
  contributor claim before funding.
- Contributor claims require GitHub OAuth. The server compares the authenticated
  numeric GitHub user ID with the author ID returned for the exact public pull request;
  a typed username is not accepted as identity proof. The claim record stores the
  canonical login and numeric ID alongside the receiving Rialo wallet.
- OAuth state and session cookies have separate versioned audiences and bounded
  lifetimes. Each session receives a random session ID; reconnecting GitHub invalidates
  claim authorizations created by the prior session.
- The official web claim flow issues a five-minute HMAC authorization with a random
  nonce and explicit claim audience. It binds the OAuth session, numeric GitHub ID,
  canonical login, receiving wallet, program/network, bounty PDA, repository/PR,
  workflow slug, and derived claim PDA. Consumption requires a matching same-origin,
  HttpOnly `SameSite=Strict` cookie, which is cleared on the first attempt.
- OAuth remains an off-chain identity boundary: Rialo cannot call GitHub from inside the
  program. Sponsor approval is still required and must review the exact PR, identity,
  and wallet before funding.
- The strong-proof REX component constructs only bounded URLs from committed,
  slug-validated fields: PR details, the locked commit's status/check-runs, and the PR's
  reviews. It uses fixed non-secret headers and requires no GitHub App installation token
  or private key. GitHub OAuth remains separate and is used only for contributor identity
  binding. New workflows are accepted only with the exact policy-locked DevNet component
  recorded above; rotating that component requires a coordinated program redeployment.
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

The program pays only when every report output is `RexOutput::Success`, all outputs carry
the same compact `MP1` proof, and that proof reproduces the immutable settlement policy.
A current head mismatch, target-branch change, unmerged PR, failed or incomplete CI,
insufficient current-commit approvals, HTTP error, malformed output, empty report, or
validator disagreement leaves funds locked for a later retry or post-deadline refund.

For a public GitHub repository, `404` can also mean that the repository/PR is missing
or inaccessible. That ambiguity cannot create a payout; it only keeps the
sponsor-selected bounty locked until refund.

## Known limitations

- DevNet only; no security audit.
- The active marketplace and autonomous settlement ABI is deployed at the recorded
  program, with funding plus automatic payout and refund lineages preserved in
  `docs/EVIDENCE.md`.
- The REX component binding is DevNet-specific. A future component rotation must update
  the on-chain allowlist and redeploy the program before new bounties can use it.
- Native RLO escrow only; no token interface yet.
- One sponsor, one approved beneficiary, one PR, and one fixed amount per workflow.
- One claim record can be approved for a bounty in the current MVP; replacing or
  rejecting a submitted claim needs an explicit protocol instruction before funding.
- The active program arms native merge polling and deadline refund through `AFTER`.
  Both terminal branches are DevNet-proven; sponsor-triggered check/refund actions
  remain explicit fallbacks and are idempotent when an automatic branch wins the race.
- The native timestamp subscription currently receives an active window of roughly 100
  commits. MergePay re-arms merge polling every 10 seconds; DevNet proof demonstrates
  the current behavior but does not guarantee production liveness under future runtime
  versions or network outages.
- The current PR and merge proof paths target public repositories only. GitHub OAuth
  access tokens are exchanged and used server-side for identity lookup, never stored in
  the browser session or exposed to the client.
- Claim authorization is an application-layer guard for the official MergePay web flow,
  not a validator-attested onchain credential. A direct native caller can submit a
  contributor-signed claim proposal with arbitrary identity fields, but cannot approve
  it. The official sponsor approval flow re-fetches the public PR and rejects a numeric
  author-ID mismatch before the program locks the beneficiary.
- The current settlement path supports public repositories only. Private repository
  merge proof would require a separately designed authenticated REX flow and credential
  lifecycle; the legacy GitHub App route is not part of active funding.
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
- Private-repository authentication policy and production secret-operations design.
- Version-gated clock semantics.
- Production-grade wallet integration, independent wallet audit, phishing resistance,
  hardware-backed key custody, and recovery UX.
