# Contributing to MergePay

Keep changes inside the boundary they belong to:

- product experience: `apps/web`;
- Rialo program logic: `programs/mergepay-rialo`;
- typed browser/program integration: `packages/rialo-client`;
- network records: `deployments`;
- engineering and review material: `docs`.

Before requesting review, run the relevant format, compile, test, and production-build
checks. Never commit private keys, `.env` files, wallet exports, or unreviewed generated
artifacts. Any DevNet claim must include an inspectable transaction or callback in
`docs/EVIDENCE.md`.
