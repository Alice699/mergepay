# Claim bounty

The marketplace claim flow keeps the sponsor-owned bounty PDA separate from the
contributor-owned claim PDA required by Rialo Venus payer derivation.

1. `request-claim-action.tsx` requires GitHub OAuth, verifies the authenticated
   GitHub user ID against the exact PR author, then submits `request_claim` from
   the contributor wallet.
2. The contributor shares the resulting claim workflow address.
3. `accept-claim-action.tsx` reads that claim account and submits `accept_claim`
   from the sponsor wallet after the onchain program matches all bounty terms.
4. The main bounty can then be funded; its beneficiary is locked for payout.

The browser check is gated by a signed, HttpOnly GitHub identity session. The
server never places the GitHub access token in the browser session; it keeps only
the verified numeric GitHub user ID, login, and display metadata. The claim ABI
records both the canonical login and numeric user ID so a typed username cannot
be used as identity proof.

The current scope is public repositories and read-only GitHub identity access.
It does not request repository write permission or support private repositories.
