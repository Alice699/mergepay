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

The web app calls Rialo only through `packages/rialo-client`; transaction encoding,
PDA derivation, and generated protocol types do not belong in UI components.

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
`deployments/devnet.json`; Activity uses exact recorded DevNet signatures; account
screens render an explicit unavailable state until the real Rialo read client exists.
Wallet, balance, bounty, and transaction success states are never simulated.
