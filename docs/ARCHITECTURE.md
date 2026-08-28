# MergePay Architecture

## Components

| Component | Responsibility |
| --- | --- |
| Sponsor | Creates, funds, checks, queries status, and refunds its workflow |
| Workflow PDA | Persists bounty state and holds rent plus escrow |
| Rialo REX | Performs validator-attested GitHub HTTP requests |
| Subscriber | Triggers the one-shot callback when the REX report is ready |
| Beneficiary | Writable callback account that receives a successful payout |
| GitHub API | Supplies the compact merged/not-merged HTTP status |

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
```

## State transitions

| Current state | Instruction/event | Guard | Result |
| --- | --- | --- | --- |
| Missing | `create_bounty` | Valid inputs and future deadline | PDA initialized |
| Created | `fund` | Sponsor; not terminal | Exact escrow transferred |
| Funded | `check_merge` | Sponsor; before deadline | One-shot REX + subscription |
| Funded | Callback: all `204` | Beneficiary/account match; sufficient PDA balance | Paid; escrow released |
| Funded | Callback: all `404` | Non-empty unanimous report | No state payout; escrow locked |
| Funded | Callback: mixed/error | Any non-unanimous result | Inconclusive; escrow locked |
| Funded | `refund` | Sponsor; after deadline | Refunded; escrow returned |
| Paid/refunded | Any payout path | Terminal flag set | No second release |

## Why one payer owns the workflow

Venus derives the workflow PDA from `(program_id, payer, workflow_pda_slug)`. The same
sponsor therefore invokes create, fund, check, status, and refund. Switching the payer
selects a different PDA even when the slug is unchanged.

Role separation is preserved in the callback. The committed beneficiary is carried as
a separate writable account and verified against state before any balance mutation.
The handler independently rechecks that callback account 0 is the committed sponsor.

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
