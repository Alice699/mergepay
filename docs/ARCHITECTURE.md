# MergePay Architecture

## Components

| Component | Responsibility |
| --- | --- |
| Sponsor | Publishes, approves, funds, checks, queries status, and refunds its workflow |
| Workflow PDA | Persists bounty state and holds rent plus escrow |
| Contributor claim PDA | Records the contributor wallet and GitHub author claim, derived from the contributor payer |
| Rialo REX | Performs validator-attested GitHub HTTP requests |
| Subscriber | Triggers the one-shot callback when the REX report is ready |
| Rialo timer subscription | Candidate path that invokes the refund callback at the immutable deadline |
| Approved contributor | Writable callback account that receives a successful payout |
| GitHub API | Supplies the compact merged/not-merged HTTP status |

## Browser signing boundary

The dApp exposes one wallet context with two interchangeable signers:

| Adapter | Current purpose |
| --- | --- |
| Frost / Wallet Standard | Connect a compatible Rialo extension when available |
| MergePay embedded signer | DevNet-only reviewer onboarding without an extension |

The embedded path generates an Ed25519 key through `@rialo/ts-cdk`, encrypts its secret
with AES-GCM and a password-derived key, and stores only the encrypted vault in
IndexedDB. Signing occurs locally after a MergePay confirmation dialog. The adapter
verifies network, payer, program ID, and public instruction discriminant before using
the key. Signed bytes are submitted through the same typed Rialo client and are not
reported as successful until RPC confirmation returns `executed=true`.

The RPC faucet path is separate from signing: the SDK requests one DevNet RLO for the
public address and waits for confirmation. It creates no fabricated balance state.

Browser clients call the same-origin `/api/rialo` route. That route relays a narrow
allowlist of JSON-RPC methods to the official DevNet endpoint, which does not emit an
`Access-Control-Allow-Origin` header for arbitrary local origins. Keeping this transport
boundary same-origin avoids a false “DevNet offline” state caused by browser CORS. The
relay accepts no batch requests, limits request size, and caps each faucet request at
one RLO.

## State

```text
sponsor: Pubkey
beneficiary: Pubkey
github_owner: String
github_repo: String
pull_number: u64
amount_kelvin: u64
deadline_unix_ms: u64
funded: bool
merge_confirmed: bool
paid: bool
refunded: bool
checks: u64
claim_request: bool
claim_target: Pubkey
claimant_github: String
claimant_github_id: u64
```

## State transitions

| Current state | Instruction/event | Guard | Result |
| --- | --- | --- | --- |
| Missing | `create_bounty` | Valid inputs, future deadline, zero beneficiary sentinel | Open bounty PDA initialized |
| Open bounty | `request_claim` | Contributor payer; OAuth identity matches the target PR; target open; before deadline | Contributor-owned claim PDA records wallet, GitHub login, and numeric user ID |
| Open bounty + claim record | `accept_claim` | Sponsor; exact target terms and GitHub identity match; before deadline | Beneficiary and claimant GitHub identity locked on main PDA |
| Claimed | `fund` | Sponsor; beneficiary approved; not terminal | Exact escrow transferred |
| Funded | Merge-check handler (UI action: `check_merge`) | Sponsor; current Venus branch; before deadline | Fresh one-shot REX + subscription |
| Funded | Callback: all `204` | Beneficiary/account match; sufficient PDA balance | Paid; escrow released |
| Funded | Callback: all `404` | Non-empty unanimous report | No state payout; escrow locked |
| Funded | Callback: mixed/error | Any non-unanimous result | Inconclusive; escrow locked |
| Funded | `refund` | Sponsor; after deadline | Refunded; escrow returned |
| Funded | Native timer callback (candidate) | Deadline reached; sponsor signer; not terminal | Refunded; escrow returned |
| Paid/refunded | Any payout path | Terminal flag set | No second release |

## Marketplace claim flow

Venus derives a workflow PDA from `(program_id, payer, workflow_pda_slug)`. A contributor
therefore cannot safely mutate the sponsor-owned bounty directly: doing so would change
the PDA identity and weaken sponsor ownership. MergePay uses two linked records instead:

1. The sponsor-created main PDA starts with the zero pubkey beneficiary sentinel.
2. The contributor signs in with GitHub, the web API matches the authenticated numeric
   user ID to the public PR author, and the contributor signs `request_claim` from a
   separate wallet. That creates a contributor-derived claim PDA.
3. The sponsor supplies the claim PDA to `accept_claim`. The program reads the claim
   account and compares target, sponsor, repository, PR, amount, deadline, and GitHub
   login and numeric GitHub user ID before copying the contributor wallet into the main PDA.
4. Funding is rejected until the beneficiary is assigned, so the approved wallet cannot
   be changed after escrow begins.

The browser's GitHub step requires OAuth identity binding. The access token is exchanged
server-side and is never placed in the browser session. The current scope is public
repositories and read-only identity access; private repositories and repository write
access remain future work.

## Public bounty discovery

The marketplace page discovers listings from the chain rather than from a hand-maintained
database. The client reads the MergePay program in 25-signature pages and follows the
Rialo `before` cursor for contributor-driven backfill. It identifies current
`create_bounty` instructions, rejects legacy ABI instructions and non-canonical workflow
PDAs, reads the workflow accounts directly, and keeps only valid, future, non-terminal
records. The UI exposes scope, lifecycle status, repository, deadline, and text filters,
and labels the shared DevNet source. The RPC relay exposes only the bounded read methods
needed for this path. A persistent server-side historical indexer remains a release task.

## Native deadline refund prototype

The current source candidate registers a one-shot `AFTER self.deadline_unix_ms CALL
[auto_refund]` subscription while `fund` executes. The generated `fund` ABI therefore
requires `subscription_pda_0`, and the callback reuses the same sponsor, deadline,
terminal-state, rent, and checked-balance validation as manual refund. Equality at the
deadline boundary is treated as expired so the timer cannot consume its one-shot trigger
without a valid settlement attempt.

The recorded marketplace deployment at
`6PWtFXUA21nTjALCFwsbmpQyzn4ifEHnbPy56MmF1etL` predates the retry-safe merge-check ABI
in this working tree. It must be rebuilt and redeployed before the new handler path can
be tested. The claim, settlement, and timer paths remain unproven until the DevNet E2E
handoff is run. Rialo's generated timestamp
predicate also uses an active window of roughly 100 commits, so long deadlines need a
heartbeat or rescheduling design before this becomes a production liveness guarantee.
Do not describe refund as autonomous until the deployed program's lineage contains the
timer callback and the workflow account decodes as `refunded=true` without a manual
refund click.

## Why one payer owns the workflow

Venus derives the workflow PDA from `(program_id, payer, workflow_pda_slug)`. The same
sponsor therefore invokes create, fund, check, status, and refund. Switching the payer
selects a different PDA even when the slug is unchanged.

Role separation is preserved in the callback. The committed beneficiary is carried as
a separate writable account and verified against state before any balance mutation.
The handler independently rechecks that callback account 0 is the committed sponsor.

## Retry-safe merge checks

Venus assigns async branches from the first workflow state field. A completed REX
callback consumes its one-shot subscription and REX accounts, so the browser reads the
workflow's next branch and derives a new pair for every sponsor retry. The generated
`run_merge_check` timer-handler ABI carries that branch explicitly; its account layout is
`payer`, `workflow`, `rex_registry`, `system_program`, `subscriber_interface`,
`subscription_pda`, and `rex_pda`. The UI keeps the friendly action name `check_merge`
while serializing this handler instruction under the hood.

## Callback ABI rule

Venus `0.18.1` treats a handler's final argument as its event payload. The supported
signature is therefore:

```rust
handler fn handle_merge_response(
    &mut self,
    beneficiary: Pubkey,
    report: RexReport,
) -> ProgramResult
```

`WriteAccountInfo::from(beneficiary)` causes the generated callback constructor to use
this account order:

| Index | Account | Access |
| --- | --- | --- |
| 0 | Sponsor/payer | signer, writable |
| 1 | Workflow PDA | writable |
| 2 | System program | read-only |
| 3 | Beneficiary | writable, not signer |
| 4 | REX event-data PDA | read-only |

Macro expansion and the generated manifest were both inspected to verify this layout.

## Escrow accounting

Creation allocates the workflow's rent reserve. Funding adds only `amount_kelvin`.
Payout/refund first require:

```text
workflow balance >= rent minimum + amount_kelvin
```

They subtract only `amount_kelvin`, leaving the workflow account rent-exempt.

## External response model

The full GitHub PR representation exceeded the observed REX response limit of `12,987`
bytes. MergePay instead uses GitHub's compact merged-check endpoint:

- HTTP `204` becomes `RexOutput::Success` with an empty body.
- HTTP `404` becomes `RexError::HttpStatusError { status: 404, ... }`.
- Every report output must agree before payout.

This produces a small, deterministic signal with a fail-closed settlement policy.
