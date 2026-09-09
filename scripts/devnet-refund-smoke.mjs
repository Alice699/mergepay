import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  Keypair,
  MergePayClient,
} from "../packages/rialo-client/dist/index.js";

const PROGRAM_ID = "6LwYmJtjnrJqSRy6fgWHY7pUZcYtrQ6FD8qwyCeKWe5";
const RPC_URL = "https://devnet.rialo.io";
const DEFAULT_KEYPAIR_PATH = join(
  homedir(),
  ".config",
  "rialo",
  "keys",
  "default.json",
);
const AMOUNT_KELVIN = 50_000_000n;
const SETTLEMENT_MODE =
  process.env.SETTLEMENT_MODE === "paid"
    ? "paid"
    : process.env.REFUND_MODE === "manual"
      ? "manual-refund"
      : "auto-refund";
const DEADLINE_DELAY_MS =
  SETTLEMENT_MODE === "paid"
    ? 90_000
    : SETTLEMENT_MODE === "manual-refund"
      ? 31_250
      : 30_000;
const SETTLEMENT_TIMEOUT_MS = 55_000;

const keypairPath = process.env.RIALO_KEYPAIR_PATH || DEFAULT_KEYPAIR_PATH;
const storedKeypairBytes = Uint8Array.from(
  JSON.parse(readFileSync(keypairPath, "utf8")),
);
if (storedKeypairBytes.length !== 32 && storedKeypairBytes.length !== 64) {
  throw new Error(`unsupported keypair length: ${storedKeypairBytes.length}`);
}
const secretBytes = storedKeypairBytes.slice(0, 32);
const signer = Keypair.fromSecretKey(secretBytes);
secretBytes.fill(0);
storedKeypairBytes.fill(0);

const sponsor = signer.publicKey.toString();
const beneficiary = "5wk6cLsYjhYSpr7brqtJ7xnvzbh1zvUpoSxeivbjyEkd";
const workflowSlug = randomBytes(32).toString("hex");
const deadlineUnixMs = BigInt(Date.now() + DEADLINE_DELAY_MS);
const client = new MergePayClient({
  network: "devnet",
  rpcUrl: RPC_URL,
  programId: PROGRAM_ID,
});

async function submit(label, instructions) {
  const transaction = await client.buildTransaction(sponsor, instructions);
  const signed = transaction.sign(signer);
  signed.ensureSigned();
  const confirmation = await client.sendAndConfirm(signed);
  if (!confirmation.executed) {
    throw new Error(`${label} failed: ${confirmation.err ?? "unknown error"}`);
  }
  console.log(`${label}: ${confirmation.signature}`);
  return confirmation.signature;
}

try {
  const create = client.buildCreateBounty({
    payer: sponsor,
    workflowSlug,
    beneficiary,
    githubOwner: "Alice699",
    githubRepo: "mergepay-demo",
    pullNumber: SETTLEMENT_MODE === "paid" ? 3 : 5,
    amountKelvin: AMOUNT_KELVIN,
    deadlineUnixMs,
  });
  await submit("create", [create]);

  // Versioned compatibility envelope used only to prepare workflow storage.
  const githubAuthCiphertext = Uint8Array.from([
    2,
    2, 0, 0, 0, 2, 9,
    2, 0, 0, 0, 2, 8,
  ]);
  const prepare = client.buildPrepareFunding({
    payer: sponsor,
    workflowSlug,
    githubAuthCiphertext,
  });
  const fund = client.buildFund({ payer: sponsor, workflowSlug });
  await submit("prepare+fund", [prepare, fund]);

  const workflowAddress = fund.workflowPda;
  const funded = await client.getWorkflowByAddress(workflowAddress);
  if (!funded?.state.funded) throw new Error("workflow was not marked funded");
  if (funded.account.kelvin < AMOUNT_KELVIN) {
    throw new Error(
      `escrow did not remain locked: ${funded.account.kelvin} kelvin`,
    );
  }
  console.log(`escrow locked: ${funded.account.kelvin} kelvin`);

  if (SETTLEMENT_MODE === "paid") {
    const startedAt = Date.now();
    while (Date.now() - startedAt < SETTLEMENT_TIMEOUT_MS) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const workflow = await client.getWorkflowByAddress(workflowAddress);
      if (workflow?.state.paid) {
        console.log(`automatic payout confirmed: ${workflowAddress}`);
        console.log(`terminal balance: ${workflow.account.kelvin} kelvin`);
        process.exitCode = 0;
        break;
      }
      if (workflow?.state.refunded) {
        throw new Error("paid smoke test refunded instead of paying beneficiary");
      }
    }

    if (process.exitCode !== 0) {
      throw new Error("automatic payout did not settle before the smoke-test timeout");
    }
  } else if (SETTLEMENT_MODE === "manual-refund") {
    const waitMs = Number(deadlineUnixMs) - Date.now() + 75;
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    const refund = client.buildRefund({ payer: sponsor, workflowSlug });
    await submit("manual refund", [refund]);
    const workflow = await client.getWorkflowByAddress(workflowAddress);
    if (!workflow?.state.refunded) {
      throw new Error("manual refund transaction did not set refunded state");
    }
    console.log(`manual refund confirmed: ${workflowAddress}`);
    console.log(`terminal balance: ${workflow.account.kelvin} kelvin`);
    process.exitCode = 0;
  } else {
    const startedAt = Date.now();
    while (Date.now() - startedAt < SETTLEMENT_TIMEOUT_MS) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const workflow = await client.getWorkflowByAddress(workflowAddress);
      if (workflow?.state.refunded) {
        console.log(`auto refund confirmed: ${workflowAddress}`);
        console.log(`terminal balance: ${workflow.account.kelvin} kelvin`);
        process.exitCode = 0;
        break;
      }
    }

    if (process.exitCode !== 0) {
      throw new Error("automatic refund did not settle before the smoke-test timeout");
    }
  }
} finally {
  signer.dispose();
}
