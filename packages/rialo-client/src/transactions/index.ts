import {
  Transaction,
  TransactionBuilder,
  PublicKey,
} from "@rialo/ts-cdk";
import { asU64 } from "../encoding.js";
import type { MergePayInstruction } from "../instructions/index.js";

export interface BuildTransactionOptions {
  validFrom?: bigint | number;
  configHashPrefix: bigint | number;
  occ?: boolean;
}

export function buildUnsignedTransaction(
  payer: string,
  instructions: readonly MergePayInstruction[],
  options: BuildTransactionOptions,
): Transaction {
  if (instructions.length === 0) {
    throw new RangeError("a transaction must contain at least one instruction");
  }

  const builder = TransactionBuilder.create()
    .setPayer(PublicKey.fromString(payer))
    .setValidFrom(
      asU64(options.validFrom ?? BigInt(Date.now()), "validFrom"),
    )
    .setConfigHashPrefix(
      asU64(options.configHashPrefix, "configHashPrefix"),
    )
    .setOcc(options.occ ?? false);

  builder.addInstructions(instructions);
  return builder.build();
}

export function serializeTransaction(
  transaction: Transaction | Uint8Array,
): Uint8Array {
  return transaction instanceof Uint8Array
    ? new Uint8Array(transaction)
    : transaction.serialize();
}
