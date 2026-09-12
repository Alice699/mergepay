# Web Tests

- `embedded-wallet.test.mjs` covers local wallet encryption and persistence helpers.
- `structure.test.mjs` protects architectural and security boundaries.
- `e2e/` covers wallet-aware Activity and Settlements journeys in Chromium.

Run the deterministic browser suite from the repository root:

```bash
npm run test:e2e
```

The E2E boundary supplies a Wallet Standard test wallet and deterministic Rialo
JSON-RPC responses inside each browser context. It never signs a live transaction,
requests faucet funds, or mutates DevNet. A final manual DevNet smoke test remains
useful before a production release, but the pagination, loading, refresh-failure,
empty-state, and mobile regressions are automated here.
