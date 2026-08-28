import { BincodeReader, readPublicKey, toPublicKey } from "../encoding.js";
import type {
  DecodedMergePayWorkflow,
  MergePayAccountInfo,
  MergePayWorkflowState,
} from "../types.js";

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

  return {
    discriminator,
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
