# MergePay Rialo Program

This directory contains the complete onchain boundary:

- `src/lib.rs` — Venus workflow implementation;
- `wit/` — generated public interface and account manifest;
- `artifact/` — companion crate that produces the deployable PolkaVM binary.

From the repository root:

```bash
cargo check -p mergepay-rialo
cargo build --manifest-path programs/mergepay-rialo/artifact/Cargo.toml
```

The companion build writes the deployable binary under
`programs/mergepay-rialo/target/rialo-build/`; this output is intentionally ignored by
version control.

Never place keypairs, RPC credentials, or GitHub tokens in this directory.
