# Accounts

`decodeWorkflowState()` reads the exact bincode field order emitted by the Venus program:
the discriminator, two public keys, two length-prefixed strings, three `u64` values,
four booleans, and the check counter. `decodeWorkflowAccount()` additionally validates
the account owner against the configured MergePay program.

The decoder intentionally does not assume fixed string offsets; the onchain account
size is determined by the actual UTF-8 payload.
