# Claim bounty

The marketplace claim flow keeps the sponsor-owned bounty PDA separate from the
contributor-owned claim PDA required by Rialo Venus payer derivation.

1. `request-claim-action.tsx` requires GitHub OAuth, verifies the authenticated
   GitHub user ID against the exact PR author, then requests a five-minute
   authorization bound to that OAuth session, the receiving wallet, program and
   network, bounty PDA, repository/PR, workflow slug, and derived claim PDA.
   The authorization carries a unique nonce and explicit audience.
2. Immediately before building `request_claim`, the app consumes that
   authorization through a same-origin endpoint. A separate HttpOnly,
   `SameSite=Strict` cookie must match the presented token and is cleared on the
   first consume attempt. An expired proof, replay, OAuth session change, wallet
   change, or target change fails closed and requires fresh verification.
3. The sponsor page discovers confirmed `request_claim` transactions through
   the bounty workflow history and derives each contributor claim address. A
   single result is selected automatically; multiple valid results require an
   explicit sponsor choice.
4. `accept-claim-action.tsx` presents a claim review containing the GitHub
   identity, payout wallet, PR target, amount, deadline, claim PDA, and Rialo
   Scan transaction. The review API fetches the public PR again and compares its
   stable numeric author ID with the ID recorded in the claim.
5. `use-accept-claim.ts` decodes the selected claim and repeats both the bounty
   term checks and live GitHub author check immediately before opening the
   sponsor wallet. An unavailable or mismatched response fails closed.
6. The main bounty can then be funded; its beneficiary is locked for payout.

The contributor's claim-creation check is gated by a signed, HttpOnly GitHub
identity session. The
server never places the GitHub access token in the browser session; it keeps only
the verified numeric GitHub user ID, login, and display metadata. The claim ABI
records both the canonical login and numeric user ID so a typed username cannot
be used as identity proof.

The short-lived claim authorization protects the official MergePay web flow; it
is not a validator-attested credential and is not stored in the Rialo account.
The native program still treats `request_claim` as a contributor-signed proposal.
A direct program caller can propose identity fields without OAuth, but cannot
approve the proposal: the sponsor remains the only approval authority, and the
official sponsor flow re-fetches GitHub and rejects an author-ID mismatch before
locking the beneficiary.

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
