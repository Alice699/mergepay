export const CLAIM_AUTHORIZATION_AUDIENCE = "mergepay:github-claim:v1";
export const CLAIM_AUTHORIZATION_TTL_MS = 5 * 60 * 1_000;

const CLOCK_SKEW_MS = 30_000;
const MAX_TOKEN_LENGTH = 8_192;
const NONCE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function base64UrlEncode(value) {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlDecode(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  return base64UrlEncode(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
    ),
  );
}

export function constantTimeEqual(left, right) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isBoundedString(value, maximum = 256) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function isValidClaims(value) {
  return (
    isRecord(value) &&
    value.version === 1 &&
    value.audience === CLAIM_AUTHORIZATION_AUDIENCE &&
    NONCE_PATTERN.test(value.nonce) &&
    isBoundedString(value.sessionId) &&
    isPositiveSafeInteger(value.issuedAt) &&
    isPositiveSafeInteger(value.expiresAt) &&
    value.expiresAt > value.issuedAt &&
    value.expiresAt - value.issuedAt <= CLAIM_AUTHORIZATION_TTL_MS &&
    isPositiveSafeInteger(value.githubId) &&
    isBoundedString(value.githubLogin, 39) &&
    isBoundedString(value.walletAddress, 64) &&
    isBoundedString(value.targetWorkflow, 64) &&
    isBoundedString(value.claimWorkflow, 64) &&
    isBoundedString(value.workflowSlug, 128) &&
    isBoundedString(value.owner, 100) &&
    isBoundedString(value.repo, 100) &&
    isPositiveSafeInteger(value.pullNumber) &&
    isBoundedString(value.programId, 64) &&
    isBoundedString(value.network, 16)
  );
}

async function createSignedValue(value, secret) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new TypeError("Claim authorization requires a secret of at least 32 characters.");
  }
  const encoded = base64UrlEncode(JSON.stringify(value));
  return `${encoded}.${await sign(encoded, secret)}`;
}

async function readSignedValue(token, secret) {
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > MAX_TOKEN_LENGTH ||
    typeof secret !== "string" ||
    secret.length < 32
  ) {
    return null;
  }
  const separator = token.lastIndexOf(".");
  if (separator < 1) return null;
  const encoded = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!constantTimeEqual(signature, await sign(encoded, secret))) return null;
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(encoded)));
  } catch {
    return null;
  }
}

export class ClaimAuthorizationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ClaimAuthorizationError";
    this.code = code;
  }
}

export async function createClaimAuthorization(
  binding,
  { secret, now = Date.now(), nonce = crypto.randomUUID() },
) {
  const claims = {
    version: 1,
    audience: CLAIM_AUTHORIZATION_AUDIENCE,
    nonce,
    sessionId: binding.sessionId,
    issuedAt: now,
    expiresAt: now + CLAIM_AUTHORIZATION_TTL_MS,
    githubId: binding.githubId,
    githubLogin: binding.githubLogin,
    walletAddress: binding.walletAddress,
    targetWorkflow: binding.targetWorkflow,
    claimWorkflow: binding.claimWorkflow,
    workflowSlug: binding.workflowSlug,
    owner: binding.owner,
    repo: binding.repo,
    pullNumber: binding.pullNumber,
    programId: binding.programId,
    network: binding.network,
  };
  if (!isValidClaims(claims)) {
    throw new ClaimAuthorizationError(
      "Claim authorization contains an invalid identity or target binding.",
      "CLAIM_AUTHORIZATION_INVALID",
    );
  }
  return {
    claims,
    token: await createSignedValue(claims, secret),
  };
}

export async function verifyClaimAuthorization(
  token,
  expected,
  { secret, now = Date.now() },
) {
  const claims = await readSignedValue(token, secret);
  if (!isValidClaims(claims)) {
    throw new ClaimAuthorizationError(
      "The GitHub claim authorization is invalid.",
      "CLAIM_AUTHORIZATION_INVALID",
    );
  }
  if (claims.issuedAt > now + CLOCK_SKEW_MS) {
    throw new ClaimAuthorizationError(
      "The GitHub claim authorization is not valid yet.",
      "CLAIM_AUTHORIZATION_NOT_YET_VALID",
    );
  }
  if (claims.expiresAt <= now) {
    throw new ClaimAuthorizationError(
      "The GitHub claim authorization expired. Verify the pull request again.",
      "CLAIM_AUTHORIZATION_EXPIRED",
    );
  }

  const exactBindings = [
    "sessionId",
    "githubId",
    "walletAddress",
    "targetWorkflow",
    "claimWorkflow",
    "workflowSlug",
    "owner",
    "repo",
    "pullNumber",
    "programId",
    "network",
  ];
  if (exactBindings.some((field) => claims[field] !== expected[field])) {
    throw new ClaimAuthorizationError(
      "The GitHub session, wallet, pull request, or claim record changed. Verify again.",
      "CLAIM_AUTHORIZATION_BINDING_MISMATCH",
    );
  }
  return claims;
}
