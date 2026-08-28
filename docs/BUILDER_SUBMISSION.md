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

- Runtime-proven review candidate: `4VWR2cKxy5gGjcm74i36T2DKH9xPzHqKoydgaL9Q4Z6F`
- Historical pre-hardening candidate: `2WtSUhTyNfVsC7rDv5iWw3HBCkzCc9ymE1RLmQMvGShU`
- Hardened metadata: RISC-V executable, slot `4467228`, fresh runtime proof verified
- RISC-V / PolkaVM Venus program built against `0.18.1`
- Sponsor-created and funded workflow PDA
- GitHub merge check through built-in HTTP REX
- Writable beneficiary propagated into the callback
- Unanimous merged payout
- Open-PR fail-closed path
- Sponsor-only deadline refund
- Persistent status and transaction-lineage evidence

## Three-minute demo

1. Show `programs/mergepay-rialo/src/lib.rs` and the six workflow functions.
2. Show the hardened deployment with `rialo client program show` and the fresh
   runtime-proven evidence in `docs/EVIDENCE.md`.
3. Inspect merged check transaction `5zwpvatv...`.
4. Follow its lineage to callback `Fu9AhK9o...`.
5. Show the callback release log and exact beneficiary/PDA balance deltas.
6. Contrast open-PR callback `2TtNKtrz...`, where escrow remains locked.
7. Show early refund rejection `2rPkxQ1q...` and valid refund `2oitQdyD...`.

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
- No API token or private key is stored in source or workflow state.

See [SECURITY.md](SECURITY.md) for the full threat model and limitations.

## Honest scope

This is a DevNet MVP, not an audited production payment protocol. It currently supports
public GitHub repositories, native RLO, one beneficiary, and sponsor-triggered checks.
The reactive external verification and settlement path is real and fully demonstrated;
wallet UI, token support, retries, authenticated GitHub access, and audit work are next.

## Review checklist

- [x] Compiles with Rialo `0.18.1`
- [x] Deploys as an executable RISC-V program
- [x] Uses Rialo REX for a real external signal
- [x] Produces a real reactive callback lineage
- [x] Moves real DevNet balances on unanimous success
- [x] Proves no-payout and refund branches
- [x] Documents platform findings and limitations

## Requested review outcome

MergePay is ready for Builder review. The project demonstrates a Rialo-specific
application, reproducible DevNet evidence, non-trivial reactive account handling, and a
fail-closed escrow design.
