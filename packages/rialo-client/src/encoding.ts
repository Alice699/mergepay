import {
  BincodeReader,
  BincodeWriter,
  fromBase64,
  PublicKey,
} from "@rialo/ts-cdk";
import type { WorkflowSlug } from "./types.js";

const HEX_32_BYTES = /^[0-9a-fA-F]{64}$/;
const MAX_U64 = (1n << 64n) - 1n;

export function toPublicKey(value: string, label = "public key"): PublicKey {
  try {
    return PublicKey.fromString(value);
  } catch (error) {
    throw new TypeError(`${label} must be a valid Rialo public key`, {
      cause: error,
    });
  }
}

/**
 * Convert the public hex form used by the CLI/docs into the [u8; 32] nonce
 * expected by the generated program.
 */
export function workflowSlugToBytes(value: WorkflowSlug): Uint8Array {
  if (value instanceof Uint8Array) {
    if (value.length !== 32) {
      throw new RangeError("workflow slug must contain exactly 32 bytes");
    }
    return new Uint8Array(value);
  }

  const normalized = value.startsWith("0x") ? value.slice(2) : value;
  if (!HEX_32_BYTES.test(normalized)) {
    throw new TypeError(
      "workflow slug must be a 64-character hexadecimal string or 32-byte Uint8Array",
    );
  }

  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function workflowSlugToHex(value: WorkflowSlug): string {
  return Array.from(workflowSlugToBytes(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function asU64(value: bigint | number, label: string): bigint {
  let normalized: bigint;
  if (typeof value === "bigint") {
    normalized = value;
  } else if (Number.isSafeInteger(value)) {
    normalized = BigInt(value);
  } else {
    throw new TypeError(`${label} must be a safe integer or bigint`);
  }

  if (normalized < 0n || normalized > MAX_U64) {
    throw new RangeError(`${label} must fit in an unsigned 64-bit integer`);
  }
  return normalized;
}

export function decodeBase64(value: string, label = "account data"): Uint8Array {
  try {
    return fromBase64(value);
  } catch (error) {
    throw new TypeError(`${label} is not valid base64`, { cause: error });
  }
}

export function readPublicKey(reader: BincodeReader, label: string): string {
  try {
    return PublicKey.fromBytes(reader.readFixedArray(32)).toString();
  } catch (error) {
    throw new TypeError(`could not decode ${label} from workflow state`, {
      cause: error,
    });
  }
}

export { BincodeReader, BincodeWriter };
