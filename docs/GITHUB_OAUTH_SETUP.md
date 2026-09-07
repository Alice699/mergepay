# GitHub OAuth setup

MergePay uses GitHub OAuth only for contributor identity. Browsing bounties and
creating a bounty do not require GitHub sign-in. A contributor must authenticate
before claiming a bounty.

The account that registers this OAuth App does not have to own
`Alice699/mergepay`. OAuth only proves a contributor's GitHub identity; it does
not grant repository write access. Repository pushes and OAuth registration are
separate concerns.

## 1. Create the OAuth App

In the GitHub account that owns the deployment, open **Settings → Developer
settings → OAuth Apps → New OAuth App**.

Use these values:

- **Application name:** `MergePay DevNet`
- **Homepage URL:** the public MergePay URL, or `http://localhost:3000` locally
- **Authorization callback URL:** `<origin>/api/github/auth/callback`

The app requests only the `read:user` scope. It does not need repository write
permission and it does not support private repositories in this DevNet scope.

## 2. Configure the web runtime

Copy `apps/web/.env.example` into the private runtime environment and set:

```text
GITHUB_OAUTH_CLIENT_ID=the-client-id-from-github
GITHUB_OAUTH_CLIENT_SECRET=the-client-secret-from-github
GITHUB_OAUTH_REDIRECT_URI=https://your-host.example/api/github/auth/callback
GITHUB_SESSION_SECRET=a-random-value-at-least-32-characters-long
```

For local development, use:

```text
GITHUB_OAUTH_REDIRECT_URI=http://localhost:3000/api/github/auth/callback
```

Production must set `GITHUB_OAUTH_REDIRECT_URI` explicitly. MergePay rejects a
request-derived callback in production so a spoofed host header cannot redirect
the OAuth response to an unregistered origin. The value must be an HTTPS URL
whose path is exactly `/api/github/auth/callback` and must not contain a query
string or fragment.

Never commit the client secret, session secret, or a `.env.local` file. The
OAuth access token is exchanged and consumed server-side; MergePay stores only
a signed, HttpOnly identity session containing the GitHub numeric user ID,
login, and display metadata.

## 3. Verify the claim boundary

After restarting the web app:

1. Open an open bounty detail page.
2. Choose **Connect GitHub**.
3. Sign in with the account that authored the exact public PR.
4. Choose **Verify PR**.
5. Confirm that the author ID matches before signing the Rialo claim.

The claim record stores the canonical GitHub login and numeric user ID. A typed
username cannot be used as proof.

The marketplace ABI is deployed at the program recorded in `deployments/devnet.json`.
Run and record the full claim E2E before treating the GitHub ID field and settlement
path as runtime-proven on DevNet.
