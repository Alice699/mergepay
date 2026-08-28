# Transactions

`buildUnsignedTransaction()` delegates message assembly and wire serialization to
`@rialo/ts-cdk`. It sets the wallet payer, chain config-hash prefix, transaction
valid-from timestamp, and OCC flag, then returns an SDK `Transaction` for wallet
signing. Private keys stay outside this package's browser-facing API.
