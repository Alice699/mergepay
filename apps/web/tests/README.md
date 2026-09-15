# Web Tests

- `embedded-wallet.test.mjs` covers local wallet encryption and persistence helpers.
- `structure.test.mjs` protects architectural and security boundaries.
- `e2e/` covers wallet-aware Activity and Settlements journeys, live workflow
  payout/refund synchronization, stale and interrupted RPC reads, and upstream
  GitHub/Rialo failure mapping in Chromium. The upstream boundary also proves
  bounded read retries, structured rate-limit/timeout errors, and that
  `sendTransaction` is never replayed automatically.

Run the deterministic browser suite from the repository root:

```bash
npm run test:e2e
```

The E2E boundary supplies a Wallet Standard test wallet and deterministic Rialo
JSON-RPC responses inside each browser context. It never signs a live transaction,
requests faucet funds, or mutates DevNet. A final manual DevNet smoke test remains
useful before a production release, but the pagination, loading, refresh-failure,
empty-state, mobile, stale-state, payout, and refund regressions are automated here.

Run the full local fault suite, including typed-client and Rust program invariants:

```bash
npm run test:stress
```
