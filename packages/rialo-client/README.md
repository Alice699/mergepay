# Rialo Client

This package is the typed boundary between the MergePay web app and the Rialo program.
It will own generated instruction types, workflow-PDA derivation, transaction helpers,
and decoding of the onchain workflow state.

The source of truth for the interface is
`programs/mergepay-rialo/wit/mergepay-rialo-manifest.json`.

## Boundaries

- `generated/` mirrors the generated Venus interface;
- `instructions/` constructs transactions;
- `accounts/` decodes workflow state;
- `pda/` owns deterministic workflow addressing;
- `rpc/` owns reads and transaction-lineage queries;
- `wallet/` defines wallet submission capabilities.

Only stable domain types and reviewed helpers are exported from `src/index.ts`.
