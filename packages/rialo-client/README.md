# Rialo Client

This package is the typed boundary between the MergePay web app and the Rialo program.
It owns the generated ABI constants, workflow-PDA derivation, transaction helpers,
RPC adapter, and decoding of the onchain workflow state.

The source of truth for the interface is
`programs/mergepay-rialo/wit/mergepay-rialo-manifest.json`. Merge-check retries use the
generated `run_merge_check` callback ABI and the workflow's persisted next branch; the
friendly SDK method remains `buildCheckMerge()`.

Funding uses `buildPrepareFunding()` and `buildFund()` in one transaction. The first
instruction stabilizes workflow storage/rent before the second transfers escrow and
arms the native public GitHub settlement heartbeat.

## Boundaries

- `generated/` mirrors the generated Venus interface;
- `instructions/` constructs the exact bincode instruction payloads and account metas;
- `accounts/` decodes workflow state;
- `pda/` owns deterministic workflow, subscriber, REX, and event-data addresses;
- `rpc/` owns typed reads, raw transaction inspection, DevNet faucet requests,
  submission, and confirmation;
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
  programId: "6LwYmJtjnrJqSRy6fgWHY7pUZcYtrQ6FD8qwyCeKWe5",
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

The browser integration obtains signatures from a wallet adapter. The experimental
embedded DevNet adapter owns its encrypted key boundary inside `apps/web`; secret
material never enters this protocol package. `MergePayClient.getWorkflow()` reads the
PDA again from RPC, so a page reload does not depend on local UI state.

## Cursor-paginated activity

Wallet history follows Rialo's native signature cursor. The client fetches one
look-ahead record so `hasMore` is true only when another page is known to exist:

```ts
const page = await mergePay.getWalletActivityPage(walletAddress, {
  limit: 8,
  ...(previousPage?.nextBefore ? { before: previousPage.nextBefore } : {}),
});

console.log(page.items, page.hasMore, page.nextBefore);
```

Pass `nextBefore` into the next request. Omit it to return to the newest transactions.
