import assert from "node:assert/strict";
import test from "node:test";
import {
  CLAIM_AUTHORIZATION_AUDIENCE,
  CLAIM_AUTHORIZATION_TTL_MS,
  constantTimeEqual,
  createClaimAuthorization,
  verifyClaimAuthorization,
} from "../lib/github-claim-binding.js";

const secret = "mergepay-test-secret-that-is-longer-than-32-characters";
const now = 1_800_000_000_000;
const binding = {
  sessionId: "session-4bb62f48-4511-42b7-a541-f41907937f93",
  githubId: 136351960,
  githubLogin: "biawakLahat",
  walletAddress: "FmgSguqMgbJruB11111111111111111111111111111",
  targetWorkflow: "6cyKuC27KS1Dqd11111111111111111111111111111",
  claimWorkflow: "8aPzRj3wClaim111111111111111111111111111111",
  workflowSlug: "a".repeat(64),
  owner: "Alice699",
  repo: "mergepay-demo",
  pullNumber: 13,
  programId: "Amf1rCvjvMpKKwQNTwsbQUm7fZkhNP9wdwfVhEPw12Zx",
  network: "devnet",
};

function expected(overrides = {}) {
  const base = { ...binding };
  delete base.githubLogin;
  return { ...base, ...overrides };
}

test("authorizes exactly one GitHub session, wallet, PR, and claim record", async () => {
  const authorization = await createClaimAuthorization(binding, {
    secret,
    now,
    nonce: "33bfe318-6255-47b7-984f-98f728568f01",
  });
  const claims = await verifyClaimAuthorization(
    authorization.token,
    expected(),
    { secret, now: now + 1_000 },
  );

  assert.equal(claims.audience, CLAIM_AUTHORIZATION_AUDIENCE);
  assert.equal(claims.githubId, binding.githubId);
  assert.equal(claims.walletAddress, binding.walletAddress);
  assert.equal(claims.targetWorkflow, binding.targetWorkflow);
  assert.equal(claims.claimWorkflow, binding.claimWorkflow);
});

test("rejects session switching and every mutable claim target", async () => {
  const { token } = await createClaimAuthorization(binding, {
    secret,
    now,
    nonce: "566f23f1-7aa6-44ac-b356-2324fe30dcb0",
  });
  const changes = {
    sessionId: "another-session",
    githubId: 999,
    walletAddress: "another-wallet",
    targetWorkflow: "another-target",
    claimWorkflow: "another-claim-record",
    workflowSlug: "b".repeat(64),
    owner: "another-owner",
    repo: "another-repo",
    pullNumber: 14,
    programId: "another-program",
    network: "mainnet",
  };

  for (const [field, value] of Object.entries(changes)) {
    await assert.rejects(
      verifyClaimAuthorization(token, expected({ [field]: value }), {
        secret,
        now: now + 1_000,
      }),
      (error) => error?.code === "CLAIM_AUTHORIZATION_BINDING_MISMATCH",
      `${field} must be bound`,
    );
  }
});

test("rejects expired proofs and tampered audience payloads", async () => {
  const { token } = await createClaimAuthorization(binding, {
    secret,
    now,
    nonce: "12b1681f-1f22-46da-bf95-e6addf6f7bd0",
  });
  await assert.rejects(
    verifyClaimAuthorization(token, expected(), {
      secret,
      now: now + CLAIM_AUTHORIZATION_TTL_MS,
    }),
    (error) => error?.code === "CLAIM_AUTHORIZATION_EXPIRED",
  );

  const [encoded, signature] = token.split(".");
  const payload = JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(
        atob(encoded.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - encoded.length % 4) % 4)),
        (character) => character.charCodeAt(0),
      ),
    ),
  );
  payload.audience = "another-app";
  const tamperedEncoded = btoa(JSON.stringify(payload))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
  await assert.rejects(
    verifyClaimAuthorization(`${tamperedEncoded}.${signature}`, expected(), {
      secret,
      now: now + 1_000,
    }),
    (error) => error?.code === "CLAIM_AUTHORIZATION_INVALID",
  );
});

test("models one-time cookie consumption and rejects a replay after clearing", async () => {
  const { token } = await createClaimAuthorization(binding, {
    secret,
    now,
    nonce: "5df08948-1cef-492a-9fd4-5a3f26a8056f",
  });
  let authorizationCookie = token;

  assert.equal(constantTimeEqual(authorizationCookie, token), true);
  await verifyClaimAuthorization(token, expected(), { secret, now: now + 1_000 });
  authorizationCookie = "";

  assert.equal(
    Boolean(authorizationCookie) && constantTimeEqual(authorizationCookie, token),
    false,
  );
});

test("issues a fresh nonce for each short-lived authorization", async () => {
  const first = await createClaimAuthorization(binding, { secret, now });
  const second = await createClaimAuthorization(binding, { secret, now });
  assert.notEqual(first.claims.nonce, second.claims.nonce);
  assert.equal(first.claims.expiresAt - first.claims.issuedAt, CLAIM_AUTHORIZATION_TTL_MS);
});
