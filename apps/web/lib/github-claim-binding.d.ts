export const CLAIM_AUTHORIZATION_AUDIENCE: "mergepay:github-claim:v1";
export const CLAIM_AUTHORIZATION_TTL_MS: number;

export type ClaimAuthorizationErrorCode =
  | "CLAIM_AUTHORIZATION_INVALID"
  | "CLAIM_AUTHORIZATION_NOT_YET_VALID"
  | "CLAIM_AUTHORIZATION_EXPIRED"
  | "CLAIM_AUTHORIZATION_BINDING_MISMATCH";

export interface GitHubClaimBinding {
  sessionId: string;
  githubId: number;
  githubLogin: string;
  walletAddress: string;
  targetWorkflow: string;
  claimWorkflow: string;
  workflowSlug: string;
  owner: string;
  repo: string;
  pullNumber: number;
  programId: string;
  network: string;
}

export interface GitHubClaimAuthorizationClaims extends GitHubClaimBinding {
  version: 1;
  audience: typeof CLAIM_AUTHORIZATION_AUDIENCE;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

export class ClaimAuthorizationError extends Error {
  readonly code: ClaimAuthorizationErrorCode;
  constructor(message: string, code: ClaimAuthorizationErrorCode);
}

export function constantTimeEqual(left: string, right: string): boolean;

export function createClaimAuthorization(
  binding: GitHubClaimBinding,
  options: { secret: string; now?: number; nonce?: string },
): Promise<{ token: string; claims: GitHubClaimAuthorizationClaims }>;

export function verifyClaimAuthorization(
  token: string,
  expected: Omit<GitHubClaimBinding, "githubLogin">,
  options: { secret: string; now?: number },
): Promise<GitHubClaimAuthorizationClaims>;
