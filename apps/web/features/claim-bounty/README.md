# Claim bounty

The marketplace claim flow keeps the sponsor-owned bounty PDA separate from the
contributor-owned claim PDA required by Rialo Venus payer derivation.

1. `request-claim-action.tsx` requires GitHub OAuth, verifies the authenticated
   GitHub user ID against the exact PR author, then submits `request_claim` from
   the contributor wallet.
2. The sponsor page discovers confirmed `request_claim` transactions through
   the bounty workflow history and derives each contributor claim address. A
   single result is selected automatically; multiple valid results require an
   explicit sponsor choice.
3. `accept-claim-action.tsx` presents a claim review containing the GitHub
   identity, payout wallet, PR target, amount, deadline, claim PDA, and Rialo
   Scan transaction. The review API fetches the public PR again and compares its
   stable numeric author ID with the ID recorded in the claim.
4. `use-accept-claim.ts` decodes the selected claim and repeats both the bounty
   term checks and live GitHub author check immediately before opening the
   sponsor wallet. An unavailable or mismatched response fails closed.
5. The main bounty can then be funded; its beneficiary is locked for payout.

The contributor's claim-creation check is gated by a signed, HttpOnly GitHub
identity session. The
server never places the GitHub access token in the browser session; it keeps only
the verified numeric GitHub user ID, login, and display metadata. The claim ABI
records both the canonical login and numeric user ID so a typed username cannot
be used as identity proof.

The sponsor recheck uses only the public PR record and never receives the
contributor's OAuth token. The current scope is public repositories and
read-only GitHub identity access.
It does not request repository write permission or support private repositories.
The sponsor review is an application-level safety gate; the program still
enforces account ownership, exact bounty terms, sponsor authority, and the
beneficiary lock onchain. Because a direct program caller does not pass through
the web OAuth gate, the public PR recheck proves that the identity value recorded
in a claim is the author; the sponsor's explicit approval binds the displayed
payout wallet. A fully validator-attested GitHub-to-wallet binding at approval
time would require a protocol change rather than this UI review alone.
