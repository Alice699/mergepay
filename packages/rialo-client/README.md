# Rialo Client

This package is the typed boundary between the MergePay web app and the Rialo program.
It owns the generated ABI constants, workflow-PDA derivation, transaction helpers,
RPC adapter, and decoding of the onchain workflow state.

The source of truth for the interface is
`programs/mergepay-rialo/wit/mergepay-rialo-manifest.json`.

## Boundaries

- `generated/` mirrors the generated Venus interface;
- `instructions/` constructs the exact bincode instruction payloads and account metas;
- `accounts/` decodes workflow state;
- `pda/` owns deterministic workflow, subscriber, REX, and event-data addresses;
- `rpc/` owns typed reads, raw transaction inspection, submission, and confirmation;
- `transactions/` owns SDK-backed unsigned transaction creation;
- `wallet/` is reserved for wallet adapters and never receives private-key material.

The package delegates key handling, PDA hashing, bincode primitives, transaction wire
format, and RPC transport to the official `@rialo/ts-cdk`. The MergePay-specific layer
only supplies the checked-in program ABI and normalized domain types.

## Example

```ts
import {
  createMergePayClient,
  Keypair,
} from "@mergepay/rialo-client";

const mergePay = createMergePayClient({
  network: "devnet",
  programId: "4VWR2cKxy5gGjcm74i36T2DKH9xPzHqKoydgaL9Q4Z6F",
});

const instruction = mergePay.buildStatus({
  payer: sponsorAddress,
  workflowSlug: "0000000000000000000000000000000000000000000000000000000000000009",
});
const transaction = await mergePay.buildTransaction(
  sponsorAddress,
  [instruction],
);
const signed = transaction.sign(Keypair.fromSecretKey(secretKey));
const result = await mergePay.sendAndConfirm(signed);
```

The browser integration should obtain the signature from a wallet adapter instead of
calling `Keypair` with secret material. `MergePayClient.getWorkflow()` reads the PDA
again from RPC, so a page reload does not depend on local UI state.
