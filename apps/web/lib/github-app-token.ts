const GITHUB_API_VERSION = "2022-11-28";
const TOKEN_REFRESH_SKEW_MS = 60_000;
const APP_JWT_LIFETIME_SECONDS = 9 * 60;
const TOKEN_REQUEST_TIMEOUT_MS = 10_000;

interface CachedInstallationToken {
  value: string;
  expiresAtMs: number;
}

interface GitHubTokenResponse {
  token?: unknown;
  expires_at?: unknown;
}

let cachedToken: CachedInstallationToken | null = null;
let refreshInFlight: Promise<string> | null = null;

export class GitHubAppTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubAppTokenError";
  }
}

function base64UrlEncode(value: string | Uint8Array): string {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function base64Decode(value: string): Uint8Array {
  const normalized = value.replaceAll(/\s/gu, "");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function joinBytes(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function derLength(length: number): Uint8Array {
  if (length < 0x80) return Uint8Array.of(length);

  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>>= 8;
  }
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function der(tag: number, value: Uint8Array): Uint8Array {
  return joinBytes(Uint8Array.of(tag), derLength(value.length), value);
}

function rsaPkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const rsaEncryptionOid = Uint8Array.of(
    0x06,
    0x09,
    0x2a,
    0x86,
    0x48,
    0x86,
    0xf7,
    0x0d,
    0x01,
    0x01,
    0x01,
  );
  const nullValue = Uint8Array.of(0x05, 0x00);
  const algorithmIdentifier = der(
    0x30,
    joinBytes(rsaEncryptionOid, nullValue),
  );
  return der(
    0x30,
    joinBytes(
      der(0x02, Uint8Array.of(0x00)),
      algorithmIdentifier,
      der(0x04, pkcs1),
    ),
  );
}

function privateKeyToPkcs8(privateKey: string): ArrayBuffer {
  const normalized = privateKey.trim();
  const match = normalized.match(
    /-----BEGIN (RSA )?PRIVATE KEY-----([\s\S]+?)-----END (?:RSA )?PRIVATE KEY-----/u,
  );
  if (!match) {
    throw new GitHubAppTokenError(
      "GITHUB_APP_PRIVATE_KEY must contain the downloaded PEM private key.",
    );
  }

  const encodedKey = match[2];
  if (!encodedKey) {
    throw new GitHubAppTokenError(
      "GITHUB_APP_PRIVATE_KEY contains an empty PEM body.",
    );
  }
  const derBytes = base64Decode(encodedKey);
  const pkcs8 = match[1] ? rsaPkcs1ToPkcs8(derBytes) : derBytes;
  const copy = new Uint8Array(pkcs8.length);
  copy.set(pkcs8);
  return copy.buffer;
}

async function createAppJwt(appId: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1_000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iat: now - 60,
      exp: now + APP_JWT_LIFETIME_SECONDS,
      iss: appId,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyToPkcs8(privateKey),
    { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

function requiredDigits(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || !/^\d+$/u.test(value)) {
    throw new GitHubAppTokenError(`${name} is not configured.`);
  }
  return value;
}

function requiredPrivateKey(): string {
  const value = process.env.GITHUB_APP_PRIVATE_KEY?.trim().replaceAll("\\n", "\n");
  if (!value) {
    throw new GitHubAppTokenError("GITHUB_APP_PRIVATE_KEY is not configured.");
  }
  return value;
}

async function mintInstallationToken(): Promise<CachedInstallationToken> {
  const appId = requiredDigits("GITHUB_APP_ID");
  const installationId = requiredDigits("GITHUB_APP_INSTALLATION_ID");
  const privateKey = requiredPrivateKey();
  const appJwt = await createAppJwt(appId, privateKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOKEN_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${appJwt}`,
          "User-Agent": "MergePay-Rialo/0.1",
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
        signal: controller.signal,
      },
    );
    let body: GitHubTokenResponse | null = null;
    try {
      body = (await response.json()) as GitHubTokenResponse;
    } catch {
      body = null;
    }

    if (!response.ok || typeof body?.token !== "string") {
      throw new GitHubAppTokenError(
        "GitHub rejected the GitHub App installation credentials.",
      );
    }

    const expiresAtMs =
      typeof body.expires_at === "string" ? Date.parse(body.expires_at) : Number.NaN;
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      throw new GitHubAppTokenError(
        "GitHub returned an invalid GitHub App installation token lifetime.",
      );
    }
    return { value: body.token, expiresAtMs };
  } catch (error) {
    if (error instanceof GitHubAppTokenError) throw error;
    throw new GitHubAppTokenError(
      "GitHub App installation token refresh failed.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Return a cached installation token, minting a replacement before the old
 * token expires. Concurrent funding requests share one refresh request.
 */
export async function getGithubAppInstallationToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs - TOKEN_REFRESH_SKEW_MS > now) {
    return cachedToken.value;
  }

  refreshInFlight ??= mintInstallationToken().then((token) => {
    cachedToken = token;
    return token.value;
  });

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}
