import { BincodeReader, readPublicKey, toPublicKey } from "../encoding.js";
import type {
  DecodedMergePayWorkflow,
  MergePayAccountInfo,
  MergePayWorkflowState,
} from "../types.js";

function readProofString(reader: BincodeReader): string {
  // The program reserves fixed-width proof slots before funding so async REX
  // updates cannot make Venus charge rent from the escrow. NUL padding is an
  // on-chain storage detail and should never leak into UI or comparisons.
  return reader.readString().replace(/\0+$/u, "");
}

export function decodeWorkflowState(data: Uint8Array): MergePayWorkflowState {
  const reader = new BincodeReader(data);
  const discriminator = reader.readU64();
  const sponsor = readPublicKey(reader, "sponsor");
  const beneficiary = readPublicKey(reader, "beneficiary");
  const githubOwner = reader.readString();
  const githubRepo = reader.readString();
  const pullNumber = reader.readU64();
  const amountKelvin = reader.readU64();
  const deadlineUnixMs = reader.readU64();
  const funded = reader.readBool();
  const mergeConfirmed = reader.readBool();
  const paid = reader.readBool();
  const refunded = reader.readBool();
  const checks = reader.readU64();
  const claimRequest = reader.remaining() > 0 ? reader.readBool() : false;
  const claimTarget =
    reader.remaining() >= 32
      ? readPublicKey(reader, "claim target")
      : "11111111111111111111111111111111";
  const claimantGithub = reader.remaining() > 0 ? reader.readString() : "";
  const claimantGithubId = reader.remaining() >= 8 ? reader.readU64() : 0n;
  // These opaque fields are retained for the private-repository funding path.
  // Skip their bytes without ever exposing ciphertext through the public state.
  if (reader.remaining() > 0) reader.readVecBytes();
  if (reader.remaining() > 0) reader.readVecBytes();
  if (reader.remaining() >= 8) reader.readU64();
  const expectedHeadSha = reader.remaining() > 0 ? reader.readString() : "";
  const expectedBaseRef = reader.remaining() > 0 ? reader.readString() : "";
  const requireCiSuccess = reader.remaining() > 0 ? reader.readBool() : false;
  const minimumApprovals = reader.remaining() >= 8 ? reader.readU64() : 0n;
  const rawProofStatus = reader.remaining() >= 8 ? reader.readU64() : 0n;
  const proofStatus =
    rawProofStatus >= 0n && rawProofStatus <= 7n
      ? (Number(rawProofStatus) as MergePayWorkflowState["proofStatus"])
      : 7;
  const proofHeadSha = reader.remaining() > 0 ? readProofString(reader) : "";
  const proofBaseRef = reader.remaining() > 0 ? readProofString(reader) : "";
  const proofMergeCommitSha =
    reader.remaining() > 0 ? readProofString(reader) : "";
  const proofCiSuccess = reader.remaining() > 0 ? reader.readBool() : false;
  const proofApprovals = reader.remaining() >= 8 ? reader.readU64() : 0n;
  const proofCheckedUnixMs = reader.remaining() >= 8 ? reader.readU64() : 0n;
  const rexBytecodeAccount =
    reader.remaining() >= 32
      ? readPublicKey(reader, "REX bytecode account")
      : "11111111111111111111111111111111";

  return {
    discriminator,
    nextBranchNumber: discriminator,
    initialized: discriminator !== 0n,
    sponsor,
    beneficiary,
    githubOwner,
    githubRepo,
    pullNumber,
    amountKelvin,
    deadlineUnixMs,
    funded,
    mergeConfirmed,
    paid,
    refunded,
    checks,
    claimRequest,
    claimTarget,
    claimantGithub,
    claimantGithubId,
    expectedHeadSha,
    expectedBaseRef,
    requireCiSuccess,
    minimumApprovals,
    proofStatus,
    proofHeadSha,
    proofBaseRef,
    proofMergeCommitSha,
    proofCiSuccess,
    proofApprovals,
    proofCheckedUnixMs,
    rexBytecodeAccount,
  };
}

export function decodeWorkflowAccount(
  account: MergePayAccountInfo,
  expectedProgramId?: string,
): DecodedMergePayWorkflow {
  if (expectedProgramId) {
    const expectedOwner = toPublicKey(expectedProgramId, "expected program ID");
    const actualOwner = toPublicKey(account.owner, "account owner");
    if (!actualOwner.equals(expectedOwner)) {
      throw new Error(
        `workflow account owner mismatch: expected ${expectedOwner.toString()}, got ${actualOwner.toString()}`,
      );
    }
  }

  return {
    address: account.address,
    account,
    state: decodeWorkflowState(account.data),
  };
}
