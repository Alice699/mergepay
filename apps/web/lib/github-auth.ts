export interface GitHubIdentity {
  id: number;
  login: string;
  avatarUrl: string | null;
  name: string | null;
}

interface SignedState {
  state: string;
  returnTo: string;
  expiresAt: number;
}

interface SignedSession {
  identity: GitHubIdentity;
  expiresAt: number;
}

export interface GitHubOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export const GITHUB_SESSION_COOKIE = "mergepay_github_session";
export const GITHUB_STATE_COOKIE = "mergepay_github_oauth_state";

const STATE_MAX_AGE_SECONDS = 10 * 60;
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const SAFE_GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

function base64UrlEncode(value: string | Uint8Array): string {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sign(value: string, secret: string): Promise<string> {
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

function constantTimeEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function sessionSecret(): string | null {
  const secret = process.env.GITHUB_SESSION_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = forwardedHost || url.host;
  const protocol = forwardedProto === "http" || forwardedProto === "https"
    ? forwardedProto
    : url.protocol.replace(":", "");
  return `${protocol}://${host}`;
}

export function getGitHubOAuthConfig(request: Request): GitHubOAuthConfig | null {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET?.trim();
  const secret = sessionSecret();
  if (!clientId || !clientSecret || !secret) return null;

  const configuredRedirect = process.env.GITHUB_OAUTH_REDIRECT_URI?.trim();
  if (!configuredRedirect && process.env.NODE_ENV === "production") return null;
  const redirectUri = configuredRedirect || `${requestOrigin(request)}/api/github/auth/callback`;
  try {
    const parsed = new URL(redirectUri);
    const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !isLocal) return null;
    if (process.env.NODE_ENV === "production" && (parsed.protocol !== "https:" || isLocal)) return null;
    if (parsed.pathname !== "/api/github/auth/callback" || parsed.search || parsed.hash) return null;
  } catch {
    return null;
  }

  return { clientId, clientSecret, redirectUri };
}

export function isGitHubOAuthConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_OAUTH_CLIENT_ID?.trim() &&
      process.env.GITHUB_OAUTH_CLIENT_SECRET?.trim() &&
      sessionSecret(),
  );
}

export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/bounties";
  }
  try {
    const parsed = new URL(value, "https://mergepay.invalid");
    return parsed.origin === "https://mergepay.invalid" ? `${parsed.pathname}${parsed.search}${parsed.hash}` : "/bounties";
  } catch {
    return "/bounties";
  }
}

function parseCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of request.headers.get("cookie")?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) cookies.set(name, value);
  }
  return cookies;
}

function secureCookie(request: Request): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return new URL(request.url).protocol === "https:" || forwardedProto === "https";
}

function serializeCookie(
  request: Request,
  name: string,
  value: string,
  maxAge: number,
): string {
  return [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    ...(secureCookie(request) ? ["Secure"] : []),
  ].join("; ");
}

function clearCookie(request: Request, name: string): string {
  return serializeCookie(request, name, "", 0);
}

async function createSignedValue(value: unknown): Promise<string> {
  const secret = sessionSecret();
  if (!secret) throw new Error("GITHUB_SESSION_SECRET is not configured.");
  const encoded = base64UrlEncode(JSON.stringify(value));
  return `${encoded}.${await sign(encoded, secret)}`;
}

async function readSignedValue<T>(value: string | undefined): Promise<T | null> {
  const secret = sessionSecret();
  if (!secret || !value) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  const encoded = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!constantTimeEqual(signature, await sign(encoded, secret))) return null;
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(encoded))) as T;
  } catch {
    return null;
  }
}

export async function createOAuthStateCookie(
  request: Request,
  state: string,
  returnTo: string,
): Promise<string> {
  const value = await createSignedValue({
    state,
    returnTo: safeReturnTo(returnTo),
    expiresAt: Date.now() + STATE_MAX_AGE_SECONDS * 1000,
  } satisfies SignedState);
  return serializeCookie(request, GITHUB_STATE_COOKIE, value, STATE_MAX_AGE_SECONDS);
}

export async function readOAuthState(request: Request, state: string): Promise<SignedState | null> {
  const value = await readSignedValue<SignedState>(parseCookies(request).get(GITHUB_STATE_COOKIE));
  if (!value || value.state !== state || value.expiresAt < Date.now()) return null;
  return value;
}

export async function createSessionCookie(
  request: Request,
  identity: GitHubIdentity,
): Promise<string> {
  const value = await createSignedValue({
    identity,
    expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  } satisfies SignedSession);
  return serializeCookie(request, GITHUB_SESSION_COOKIE, value, SESSION_MAX_AGE_SECONDS);
}

export async function getGitHubIdentity(request: Request): Promise<GitHubIdentity | null> {
  const value = await readSignedValue<SignedSession>(parseCookies(request).get(GITHUB_SESSION_COOKIE));
  if (!value || value.expiresAt < Date.now()) return null;
  if (
    !Number.isSafeInteger(value.identity?.id) ||
    value.identity.id < 1 ||
    !SAFE_GITHUB_LOGIN.test(value.identity.login)
  ) {
    return null;
  }
  return value.identity;
}

export function clearGitHubCookies(request: Request): string[] {
  return [
    clearCookie(request, GITHUB_SESSION_COOKIE),
    clearCookie(request, GITHUB_STATE_COOKIE),
  ];
}

export function redirectWithGitHubStatus(
  request: Request,
  returnTo: string,
  status: "connected" | "signed_out" | "error",
  reason?: string,
): Response {
  const location = new URL(safeReturnTo(returnTo), request.url);
  location.searchParams.set("github", status);
  if (reason) location.searchParams.set("reason", reason);
  return new Response(null, {
    status: 302,
    headers: { Location: location.toString() },
  });
}

export function isValidGitHubIdentity(value: unknown): value is GitHubIdentity {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<GitHubIdentity>;
  return (
    Number.isSafeInteger(candidate.id) &&
    Number(candidate.id) > 0 &&
    typeof candidate.login === "string" &&
    SAFE_GITHUB_LOGIN.test(candidate.login)
  );
}
