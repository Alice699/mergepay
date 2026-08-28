import assert from "node:assert/strict";
import test from "node:test";
import {
  BincodeWriter,
  MERGEPAY_PROGRAM_ID,
  buildCheckMergeInstruction,
  buildCreateBountyInstruction,
  buildUnsignedTransaction,
  decodeWorkflowState,
  deriveCheckMergeAccounts,
  deriveMultiAccountSlug,
  deriveWorkflowPda,
} from "../dist/index.js";

const payer = "2RGascNSeBgUxpkk57zQzQSeBZoUBiuT1HSRtuKTatEo";
const beneficiary = "5wk6cLsYjhYSpr7brqtJ7xnvzbh1zvUpoSxeivbjyEkd";
const slug = "0000000000000000000000000000000000000000000000000000000000000009";
const workflowPda = "EJgmwWGUeXpB7b67qwz37PhYpewXawwSxjRk2ZHUvYUN";

test("derives the workflow and check_merge auxiliary PDAs from the ABI", () => {
  assert.deepEqual(deriveWorkflowPda(MERGEPAY_PROGRAM_ID, payer, slug), {
    address: workflowPda,
    bump: 255,
  });

  const accounts = deriveCheckMergeAccounts(MERGEPAY_PROGRAM_ID, payer, slug);
  assert.equal(accounts.subscription.address, "89UiDv7rjuMybh1ugifUcKXzMt1XUK864C2QnJJa32du");
  assert.equal(accounts.rex.address, "3qSQVGw4DNEUN5uyMCkjQtVaBAdNCAPmnJogY6hGJTJL");
  assert.equal(
    Buffer.from(accounts.subscriptionSlug).toString("hex"),
    "c551a1eda1c9ce24f6ca62cf14ad16c976c60ed1c13ca0f637bad435dacac5b9",
  );
  assert.equal(
    Buffer.from(accounts.rexSlug).toString("hex"),
    "5dca96109e9a05dd5d94e59a0a9071d743b95652026f42972e6720769395923d",
  );
  assert.equal(
    Buffer.from(deriveMultiAccountSlug(workflowPda, 0, 5)).toString("hex"),
    Buffer.from(accounts.subscriptionSlug).toString("hex"),
  );
});

test("builds the exact external instruction wire format", () => {
  const base = { programId: MERGEPAY_PROGRAM_ID, payer, workflowSlug: slug };
  const check = buildCheckMergeInstruction(base);
  assert.equal(Buffer.from(check.data).toString("hex"), `02000000${slug}`);
  assert.deepEqual(check.accounts.map((account) => account.pubkey.toString()), [
    payer,
    workflowPda,
    "Qrac1eRegistry11111111111111111111111111111",
    "11111111111111111111111111111111",
    "Subscriber111111111111111111111111111111111",
    "89UiDv7rjuMybh1ugifUcKXzMt1XUK864C2QnJJa32du",
    "3qSQVGw4DNEUN5uyMCkjQtVaBAdNCAPmnJogY6hGJTJL",
  ]);

  const create = buildCreateBountyInstruction({
    ...base,
    beneficiary,
    githubOwner: "microsoft",
    githubRepo: "vscode",
    pullNumber: 332677n,
    amountKelvin: 1_000_000n,
    deadlineUnixMs: 1_787_941_094_399n,
  });
  assert.equal(create.data.length, 123);
  assert.equal(Buffer.from(create.data.slice(0, 4)).toString("hex"), "05000000");
  assert.deepEqual(create.accounts.map((account) => account.pubkey.toString()), [
    payer,
    workflowPda,
    "11111111111111111111111111111111",
    "Subscriber111111111111111111111111111111111",
  ]);
});

test("decodes a bincode workflow account without fixed string offsets", () => {
  const writer = new BincodeWriter();
  writer
    .writeU64(2n)
    .writeFixedArray(new Uint8Array(32).fill(1), 32)
    .writeFixedArray(new Uint8Array(32).fill(2), 32)
    .writeString("microsoft")
    .writeString("vscode")
    .writeU64(332677n)
    .writeU64(1_000_000n)
    .writeU64(1_787_941_094_399n)
    .writeBool(true)
    .writeBool(true)
    .writeBool(false)
    .writeBool(false)
    .writeU64(1n);

  const state = decodeWorkflowState(writer.toBytes());
  assert.equal(state.discriminator, 2n);
  assert.equal(state.initialized, true);
  assert.equal(state.githubOwner, "microsoft");
  assert.equal(state.githubRepo, "vscode");
  assert.equal(state.pullNumber, 332677n);
  assert.equal(state.amountKelvin, 1_000_000n);
  assert.equal(state.deadlineUnixMs, 1_787_941_094_399n);
  assert.deepEqual(
    {
      funded: state.funded,
      mergeConfirmed: state.mergeConfirmed,
      paid: state.paid,
      refunded: state.refunded,
      checks: state.checks,
    },
    { funded: true, mergeConfirmed: true, paid: false, refunded: false, checks: 1n },
  );
});

test("builds an SDK transaction ready for wallet signing", () => {
  const instruction = buildCheckMergeInstruction({
    programId: MERGEPAY_PROGRAM_ID,
    payer,
    workflowSlug: slug,
  });
  const transaction = buildUnsignedTransaction(payer, [instruction], {
    validFrom: 1_787_941_000_000n,
    configHashPrefix: 6_503_867_976_636_651_715n,
  });

  assert.equal(transaction.isSigned(), false);
  assert.equal(transaction.getRequiredSignatureCount(), 1);
  assert.equal(transaction.getMessage().validFrom, 1_787_941_000_000n);
  assert.equal(transaction.getMessage().configHashPrefix, 6_503_867_976_636_651_715n);
});
