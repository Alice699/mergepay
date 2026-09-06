# Refund Bounty

This feature owns the real post-deadline recovery path:

- re-read the workflow from Rialo immediately before signing;
- require the exact on-chain sponsor and a funded, unpaid, unrefunded workflow;
- reject refund attempts at or before the immutable deadline;
- build and submit the generated `refund` instruction through the active wallet;
- refresh the exact workflow account only after executed confirmation.

The verified detail automatically replaces Check merge with Refund escrow after the
deadline. A confirmed transaction is not presented as terminal until the decoder reads
`refunded=true`; the workflow rent reserve remains in the PDA after escrow recovery.
