# MergePay Web

Reviewer-facing Vinext dApp for the complete bounty lifecycle: create, fund, verify a
merge, inspect workflow status, and refund after expiry.

## Boundaries

- `app/` owns routes and composition, not transaction logic.
- `components/` owns reusable presentation.
- `features/create-bounty/`, `fund-bounty/`, `check-merge/`, `refund-bounty/`, and
  `workflow-status/` own workflow-specific orchestration and validation.
- `providers/` owns wallet, network, and client-side query contexts.
- `lib/` contains small framework-level utilities.
- `tests/` mirrors product and architectural boundaries.

The web app uses `packages/rialo-client` as the MergePay protocol boundary. The
official `@rialo/frost` layer remains the adapter for Wallet Standard extensions, while
the DevNet-only embedded signer makes the public review path usable before a Rialo
extension is generally available. Transaction encoding, PDA derivation, and generated
protocol types do not belong in UI components.

## Current interface

The reviewer-facing interface is implemented across every route with one responsive
design system. It uses locally bundled Sora and IBM Plex Mono fonts, a route-aware
desktop/mobile navigation shell, complete footer, accessible focus states, reduced-
motion handling, section-level scroll reveals, and a restrained route transition.
Interface icons come from one Lucide family and are selected by function; directional
arrow icons and Unicode arrow glyphs are intentionally absent. The MergePay identity
is intentionally separate from that icon system: a custom-kerned Bricolage Grotesque
wordmark with a restrained settlement terminal, implemented as typography and CSS
rather than a stock pictogram or app-icon tile. Browser chrome uses an open lowercase
`m_` wordmark fragment derived from the same identity and brand colors.

The brand palette uses the user-selected soft seafoam `#A9DDD3` over cool
green-charcoal neutrals. Every brand tint derives from that hue. Brand emphasis remains
separate from semantic state: jade means verified/success, amber means warning, and
crimson means invalid/error. No lime/chartreuse or vermilion brand token remains.

The UI follows a strict no-mock rule. Deployment facts come from
`deployments/devnet.json`; Activity uses exact recorded DevNet signatures; wallet
discovery and connection use Frost; native balance and RPC health use live Rialo
queries; and transaction status comes from wallet signing plus onchain confirmation.
Rejected signatures, unsupported networks, RPC failures, and failed execution remain
distinct visible states. No wallet, balance, bounty, or transaction success state is
simulated.

## Embedded DevNet wallet

The local wallet is a real Ed25519 Rialo signer, not a mock account. It generates keys
with `@rialo/ts-cdk`, encrypts the 32-byte secret with AES-256-GCM, derives the wrapping
key with PBKDF2-HMAC-SHA-256 at 600,000 iterations, and persists only the authenticated
ciphertext in IndexedDB. Plaintext key bytes are zeroed after import/export boundaries;
the unlocked SDK keypair is disposed on lock, removal, unmount, or the 15-minute timer.

The signer is purpose-limited. It accepts only the configured DevNet, the active
MergePay program ID, the public initiating instruction discriminants, and a transaction
whose sole required signer matches the local address. A first-party confirmation dialog
shows the signer, program, action, workflow account, and committed amount before signing.
The official SDK faucet call can request and confirm 1 RLO for the generated address.
Browser RPC calls use the same-origin `/api/rialo` relay because the official DevNet
endpoint does not authorize arbitrary browser origins. The relay targets only the
configured Rialo endpoint, exposes only the methods MergePay needs, caps faucet calls
at 1 RLO, rejects batch payloads, and never handles wallet secrets.

Users can download and restore an encrypted JSON backup. Passwords and private key
material are never sent to MergePay, written to logs, stored as plaintext, or included
in the repository. This remains experimental DevNet software and must not be presented
as a production wallet or used with real funds.

## Environment

Copy `.env.example` into the runtime environment when overriding the defaults:

```text
NEXT_PUBLIC_RIALO_NETWORK=devnet
NEXT_PUBLIC_RIALO_RPC_URL=/api/rialo
RIALO_RPC_UPSTREAM_URL=https://devnet.rialo.io
NEXT_PUBLIC_MERGEPAY_PROGRAM_ID=4VWR2cKxy5gGjcm74i36T2DKH9xPzHqKoydgaL9Q4Z6F
```

`NEXT_PUBLIC_RIALO_RPC_URL` should remain same-origin unless a replacement endpoint
explicitly supports browser CORS. `RIALO_RPC_UPSTREAM_URL` is server-side and defaults
to the official DevNet RPC. The program ID is optional for the active DevNet deployment,
but keeping it explicit is recommended for a reviewer. No extension is required for the
embedded DevNet wallet. If a compatible Wallet Standard extension is installed, Frost
exposes it as a separate signing method.
