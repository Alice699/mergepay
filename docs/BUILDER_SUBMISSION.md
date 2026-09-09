# MergePay — Rialo Builder Submission

## One-line pitch

MergePay is a GitHub pull-request bounty escrow where Rialo validators verify a merge
through REX and a reactive callback releases native RLO without a trusted payout
backend.

## Why Rialo

On a conventional chain this product needs a webhook server, GitHub listener, keeper,
oracle adapter, and payout signer. On Rialo, the external HTTP check, subscription,
callback, state, and settlement form one protocol-native workflow.

That is the point of the project: not to port a static escrow to another chain, but to
show a workflow that becomes materially simpler because Rialo can react to external
signals across transactions.

## What is live

- Runtime-proven review candidate: `6QHxmfBi9DEhrcdg65c87Hp9H5Ny3xSTCT4b9vaDTsFB`
- Autonomous settlement ABI deployment: `Gdbcab4Wn5zyUYAP8C7MZzWtfbsVpYX3k6FuhnY5Dbe3` (E2E pending)
- Previous reset deployment: `4VWR2cKxy5gGjcm74i36T2DKH9xPzHqKoydgaL9Q4Z6F`
- Hardened metadata: RISC-V executable, slot `7138100`, fresh runtime proof verified
- RISC-V / PolkaVM Venus program built against `0.18.1`
- Sponsor-created and funded workflow PDA
- GitHub merge check through built-in HTTP REX
- Writable beneficiary propagated into the callback
- Unanimous merged payout
- Open-PR fail-closed path
- Sponsor-only deadline refund
- Persistent status and transaction-lineage evidence
- Extension-free DevNet onboarding with a locally encrypted Rialo signer
- Explicit transaction review, real SDK signing, DevNet faucet funding, submission,
  and executed confirmation
- Reviewer-facing create, fund, REX merge-check, payout, and post-deadline refund
  actions backed by decoded workflow state rather than mock lifecycle data

## Three-minute demo

1. Show `programs/mergepay-rialo/src/lib.rs` and the six workflow functions.
2. Show the hardened deployment with `rialo client program show` and the fresh
   runtime-proven evidence in `docs/EVIDENCE.md`.
3. Inspect merged check transaction `5njvCt6E...`.
4. Follow its lineage to callback `5Rd8NV93...`.
5. Show the callback release log and exact beneficiary/PDA balance deltas.
6. Contrast open-PR callback `bsZiH8vP...`, where escrow remains locked.
7. Show early refund rejection `4Y9ovp4F...` and valid refund `3Y5U5H5F...`.

Full signatures and balances are in [EVIDENCE.md](EVIDENCE.md).

## Engineering findings

1. The full GitHub PR JSON exceeded the observed REX `12,987`-byte response limit.
   GitHub's compact merged endpoint provides the exact required signal with no body.
2. Rialo DevNet `0.18.1` exposed workflow clock values in milliseconds. The contract
   names the public field `deadline_unix_ms` to remove ambiguity.
3. Venus derives workflow PDAs from payer plus slug. The sponsor must remain payer
   across user-driven workflow instructions.
4. Venus handler payloads must be last. Ordering the callback as
   `(beneficiary, report)` correctly generates a writable beneficiary account and a
   read-only event report account.
5. A CLI-reported signature is not proof of execution. Every proof in this submission
   was checked for transaction success and callback lineage.

## Security posture

- All payout account keys are checked against committed state.
- Callback payer is explicitly checked against the committed sponsor.
- Every REX output must agree before payout.
- Errors and disagreement fail closed.
- Terminal flags prevent replayed settlement.
- Rent reserve is preserved on both payout and refund.
- PDA ownership and all settlement balance arithmetic are checked explicitly.
- No plaintext API token or private key is stored in source, browser storage, logs, or
  workflow responses. Funding stores only a sponsor-bound DKG ciphertext for the REX
  `Authorization` header.

See [SECURITY.md](SECURITY.md) for the full threat model and limitations.

## Honest scope

This is a DevNet MVP, not an audited production payment protocol. It currently supports
public GitHub repositories, native RLO, one beneficiary, and native post-funding checks
with a sponsor fallback. Authenticated REX checks require a server-only, read-only
GitHub App installation token during funding.
The reactive external verification and settlement path is real and fully demonstrated.
The dApp includes an experimental DevNet-only embedded signer because a public Rialo
extension is not required for review. Token rotation for already-funded workflows,
private-repository policy, production wallet hardening, and audit work remain out of
scope.

## Review checklist

- [x] Compiles with Rialo `0.18.1`
- [x] Deploys as an executable RISC-V program
- [x] Uses Rialo REX for a real external signal
- [x] Produces a real reactive callback lineage
- [x] Moves real DevNet balances on unanimous success
- [x] Proves no-payout and refund branches
- [x] Documents platform findings and limitations
- [x] Provides a real no-extension DevNet signing and faucet path without mock state

## Requested review outcome

MergePay is ready for Builder review. The project demonstrates a Rialo-specific
application, reproducible DevNet evidence, non-trivial reactive account handling, and a
fail-closed escrow design.
