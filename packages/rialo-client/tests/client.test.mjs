import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BincodeWriter,
  MERGEPAY_CALLBACK_DISCRIMINANT,
  MERGEPAY_INSTRUCTION_DISCRIMINANTS,
  MERGEPAY_PROGRAM_ID,
  MERGEPAY_MANIFEST_VERSION,
  MergePayClient,
  PublicKey,
  buildAcceptClaimInstruction,
  buildCheckMergeInstruction,
  buildCreateBountyInstruction,
  buildFundInstruction,
  buildRefundInstruction,
  buildRequestClaimInstruction,
  buildUnsignedTransaction,
  decodeWorkflowState,
  deriveCheckMergeAccounts,
  deriveMultiAccountSlug,
  deriveWorkflowPda,
} from "../dist/index.js";

const manifest = JSON.parse(
  readFileSync(
    new URL(
      "../../../programs/mergepay-rialo/wit/mergepay-rialo-manifest.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

const payer = "2RGascNSeBgUxpkk57zQzQSeBZoUBiuT1HSRtuKTatEo";
const beneficiary = "5wk6cLsYjhYSpr7brqtJ7xnvzbh1zvUpoSxeivbjyEkd";
const slug = "0000000000000000000000000000000000000000000000000000000000000009";
const claimSlug = "000000000000000000000000000000000000000000000000000000000000000a";
const workflowPda = deriveWorkflowPda(MERGEPAY_PROGRAM_ID, payer, slug).address;
const claimWorkflow = deriveWorkflowPda(MERGEPAY_PROGRAM_ID, payer, claimSlug).address;

test("keeps generated client constants aligned with the checked-in Venus manifest", () => {
  assert.equal(manifest.version, MERGEPAY_MANIFEST_VERSION);
  for (const [name, discriminant] of Object.entries(
    MERGEPAY_INSTRUCTION_DISCRIMINANTS,
  )) {
    assert.equal(manifest.instructions[name].discriminant, discriminant, name);
  }
  assert.equal(
    manifest.callbacks.run_merge_check.discriminant,
    MERGEPAY_CALLBACK_DISCRIMINANT,
  );
  assert.equal(
    manifest.instructions.fund.accounts.filter((account) => account.name.startsWith("subscription_pda_")).length,
    1,
  );
  assert.deepEqual(
    manifest.instructions.fund.parameters.map((parameter) => parameter.name),
    ["workflow_pda_slug", "github_auth_ciphertext"],
  );
  assert.equal(
    manifest.callbacks.run_merge_check.accounts.filter((account) => account.name.startsWith("subscription_pda_")).length,
    2,
  );
  assert.equal(
    manifest.callbacks.run_merge_check.accounts.filter((account) => account.name.startsWith("rex_pda_")).length,
    1,
  );
  assert.deepEqual(
    manifest.instructions.request_claim.accounts.map((account) => account.name),
    ["payer", "workflow_pda", "system_program", "target_workflow"],
  );
  assert.deepEqual(
    manifest.instructions.accept_claim.accounts.map((account) => account.name),
    ["payer", "workflow_pda", "system_program", "claim_workflow"],
  );
});

test("derives the workflow and merge-check callback auxiliary PDAs from the ABI", () => {
  assert.deepEqual(deriveWorkflowPda(MERGEPAY_PROGRAM_ID, payer, slug), {
    address: workflowPda,
    bump: 254,
  });

  const accounts = deriveCheckMergeAccounts(MERGEPAY_PROGRAM_ID, payer, slug);
  assert.equal(accounts.subscription.address, "3WFbe8UQuXHTzt17pAPVBDU8SNAW4yNY6TrHEWhhbArZ");
  assert.equal(accounts.retrySubscription.address, "HhbVTAZZDjvB55ByxF6Kh8TTYyJY4h6zSqQ1Cg2P6gYZ");
  assert.equal(accounts.rex.address, "GkHnXxXSftB9GGnnT9a5w4pv1JyK3b2dBARXFE21r63V");
  assert.equal(
    Buffer.from(accounts.subscriptionSlug).toString("hex"),
    "105b48d6fd4a82b8cf6fb4c68d3254f6520792a2476289fd32782227d1bc7cae",
  );
  assert.equal(
    Buffer.from(accounts.rexSlug).toString("hex"),
    "6767b36a0603a17e2dc5cf1cdf121330a8e2417855a8cd9a0449c2a161e1ce8b",
  );
  assert.equal(
    Buffer.from(deriveMultiAccountSlug(workflowPda, 0, 5)).toString("hex"),
    Buffer.from(accounts.subscriptionSlug).toString("hex"),
  );
  assert.equal(
    Buffer.from(deriveMultiAccountSlug(workflowPda, 0, 6)).toString("hex"),
    Buffer.from(accounts.retrySubscriptionSlug).toString("hex"),
  );

  const retryAccounts = deriveCheckMergeAccounts(
    MERGEPAY_PROGRAM_ID,
    payer,
    slug,
    1,
  );
  assert.notEqual(retryAccounts.subscription.address, accounts.subscription.address);
  assert.notEqual(retryAccounts.rex.address, accounts.rex.address);
});

test("builds the exact external instruction wire format", () => {
  const base = {
    programId: MERGEPAY_PROGRAM_ID,
    payer,
    workflowSlug: slug,
    branchNumber: 0,
  };
  const check = buildCheckMergeInstruction(base);
  assert.equal(
    Buffer.from(check.data).toString("hex"),
    `07000000${slug}0000000000000000`,
  );
  assert.deepEqual(check.accounts.map((account) => account.pubkey.toString()), [
    payer,
    workflowPda,
    "Qrac1eRegistry11111111111111111111111111111",
    "11111111111111111111111111111111",
    "Subscriber111111111111111111111111111111111",
    "3WFbe8UQuXHTzt17pAPVBDU8SNAW4yNY6TrHEWhhbArZ",
    "HhbVTAZZDjvB55ByxF6Kh8TTYyJY4h6zSqQ1Cg2P6gYZ",
    "GkHnXxXSftB9GGnnT9a5w4pv1JyK3b2dBARXFE21r63V",
  ]);

  const retryCheck = buildCheckMergeInstruction({ ...base, branchNumber: 1 });
  assert.equal(
    Buffer.from(retryCheck.data).toString("hex"),
    `07000000${slug}0100000000000000`,
  );
  assert.deepEqual(retryCheck.accounts.map((account) => account.pubkey.toString()), [
    payer,
    workflowPda,
    "Qrac1eRegistry11111111111111111111111111111",
    "11111111111111111111111111111111",
    "Subscriber111111111111111111111111111111111",
    deriveCheckMergeAccounts(MERGEPAY_PROGRAM_ID, payer, slug, 1).subscription.address,
    deriveCheckMergeAccounts(MERGEPAY_PROGRAM_ID, payer, slug, 1).retrySubscription.address,
    deriveCheckMergeAccounts(MERGEPAY_PROGRAM_ID, payer, slug, 1).rex.address,
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
  assert.equal(Buffer.from(create.data.slice(0, 4)).toString("hex"), "04000000");
  assert.deepEqual(create.accounts.map((account) => account.pubkey.toString()), [
    payer,
    workflowPda,
    "11111111111111111111111111111111",
    "Subscriber111111111111111111111111111111111",
  ]);

  const githubAuthCiphertext = Uint8Array.from([
    2,
    2, 0, 0, 0, 2, 9,
    2, 0, 0, 0, 2, 8,
  ]);
  const fund = buildFundInstruction({ ...base, githubAuthCiphertext });
  assert.equal(Buffer.from(fund.data.slice(0, 4)).toString("hex"), "01000000");
  assert.equal(Buffer.from(fund.data.slice(36, 44)).readBigUInt64LE(), 13n);
  assert.deepEqual(fund.data.slice(44), githubAuthCiphertext);
  assert.deepEqual(fund.accounts.map((account) => account.pubkey.toString()), [
    payer,
    workflowPda,
    "11111111111111111111111111111111",
    "Subscriber111111111111111111111111111111111",
    "7G2UJ2iDFQNTEgDFydTDpujFqoHH3w5hBruwAQHZZbcG",
  ]);

  const refund = buildRefundInstruction(base);
  assert.equal(Buffer.from(refund.data.slice(0, 4)).toString("hex"), "08000000");
  assert.deepEqual(refund.accounts.map((account) => account.pubkey.toString()), [
    payer,
    workflowPda,
    "11111111111111111111111111111111",
    "Subscriber111111111111111111111111111111111",
  ]);

  const request = buildRequestClaimInstruction({
    programId: MERGEPAY_PROGRAM_ID,
    payer,
    workflowSlug: claimSlug,
    targetWorkflow: workflowPda,
    claimantGithub: "Alice699",
    claimantGithubId: 123456789,
  });
  assert.equal(Buffer.from(request.data.slice(0, 4)).toString("hex"), "05000000");
  assert.equal(Buffer.from(request.data.slice(-8)).readBigUInt64LE(), 123456789n);
  assert.deepEqual(request.accounts.map((account) => account.pubkey.toString()), [
    payer,
    claimWorkflow,
    "11111111111111111111111111111111",
    workflowPda,
  ]);

  const accept = buildAcceptClaimInstruction({
    programId: MERGEPAY_PROGRAM_ID,
    payer,
    workflowSlug: slug,
    claimWorkflow,
  });
  assert.equal(Buffer.from(accept.data.slice(0, 4)).toString("hex"), "06000000");
  assert.deepEqual(accept.accounts.map((account) => account.pubkey.toString()), [
    payer,
    workflowPda,
    "11111111111111111111111111111111",
    claimWorkflow,
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
    .writeU64(1n)
    .writeBool(false)
    .writeFixedArray(new Uint8Array(32), 32)
    .writeString("")
    .writeU64(987654321n);

  const state = decodeWorkflowState(writer.toBytes());
  assert.equal(state.discriminator, 2n);
  assert.equal(state.nextBranchNumber, 2n);
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
      claimRequest: state.claimRequest,
      claimTarget: state.claimTarget,
      claimantGithub: state.claimantGithub,
      claimantGithubId: state.claimantGithubId,
    },
    {
      funded: true,
      mergeConfirmed: true,
      paid: false,
      refunded: false,
      checks: 1n,
      claimRequest: false,
      claimTarget: "11111111111111111111111111111111",
      claimantGithub: "",
      claimantGithubId: 987654321n,
    },
  );
});

test("builds an SDK transaction ready for wallet signing", () => {
  const instruction = buildCheckMergeInstruction({
    programId: MERGEPAY_PROGRAM_ID,
    payer,
    workflowSlug: slug,
    branchNumber: 0,
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

test("requests bounded Rialo workflow lineage for a merge check", async () => {
  const requests = [];
  const response = {
    lineage: { workflowNodes: [] },
    leaves: [],
    truncated: false,
    truncationReason: "none",
    continuationHints: [],
  };
  const client = new MergePayClient({
    rpc: {
      getWorkflowLineage: async (request) => {
        requests.push(request);
        return response;
      },
    },
  });

  const result = await client.getWorkflowLineage(
    "5njvCt6ESqPsasd8C19oNAu6PffAS1ZdR9Wii8wWRetFzezhqQZyDPop8cWmnq48dBq3qjq9TEd5sAUzqgBmXwzF",
  );

  assert.equal(result, response);
  assert.deepEqual(requests, [
    {
      signature:
        "5njvCt6ESqPsasd8C19oNAu6PffAS1ZdR9Wii8wWRetFzezhqQZyDPop8cWmnq48dBq3qjq9TEd5sAUzqgBmXwzF",
      maxDepth: 5,
      includeEvents: true,
    },
  ]);
});

test("derives wallet activity from Rialo signature and transaction records", async () => {
  const signature =
    "5njvCt6ESqPsasd8C19oNAu6PffAS1ZdR9Wii8wWRetFzezhqQZyDPop8cWmnq48dBq3qjq9TEd5sAUzqgBmXwzF";
  const activityClient = new MergePayClient({
    rpc: {
      getSignaturesForAddress: async (address, config) => {
        assert.equal(address, payer);
        assert.equal(config, 2);
        return [{ signature, blockHeight: 12n, blockTime: 1_787_941_094n }];
      },
      getTransaction: async (transactionSignature) => {
        assert.equal(transactionSignature, signature);
        return {
          blockHeight: 12n,
          blockTime: 1_787_941_094n,
          transaction: {
            signatures: [signature],
            validFrom: 1_787_941_000_000n,
            message: {
              accountKeys: [payer, workflowPda, MERGEPAY_PROGRAM_ID],
              instructions: [
                {
                  programIdIndex: 2,
                  accounts: [0, 1],
                  data: Buffer.from([1, 0, 0, 0]).toString("base64"),
                },
              ],
            },
          },
          meta: { fee: 100n },
        };
      },
    },
  });

  const activity = await activityClient.getWalletActivity(payer, 2);
  assert.equal(activity.length, 1);
  assert.deepEqual(
    {
      action: activity[0].action,
      status: activity[0].status,
      workflowAddress: activity[0].workflowAddress,
      feeKelvin: activity[0].feeKelvin,
    },
    { action: "fund", status: "confirmed", workflowAddress: workflowPda, feeKelvin: 100n },
  );
});

test("discovers an open bounty from program history and decoded account state", async () => {
  const signature =
    "5qAb9BS7VTx39tuEjCLHQxLQp9YEDpRoRnhD8fUenfB1eyCdRPQLv5qMhYfFBfcmw7E3zuEL34omPbzTUjs7y7Se";
  const futureDeadline = BigInt(Date.now() + 86_400_000);
  const slugBytes = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  const slugHex = Buffer.from(slugBytes).toString("hex");
  const openWorkflow = deriveWorkflowPda(MERGEPAY_PROGRAM_ID, payer, slugHex).address;
  const instructionBytes = new Uint8Array(37);
  instructionBytes.set([4, 0, 0, 0], 0);
  instructionBytes.set(slugBytes, 4);

  const stateWriter = new BincodeWriter();
  stateWriter
    .writeU64(1n)
    .writeFixedArray(PublicKey.fromString(payer).toBytes(), 32)
    .writeFixedArray(new Uint8Array(32), 32)
    .writeString("Alice699")
    .writeString("mergepay")
    .writeU64(1n)
    .writeU64(1_000_000n)
    .writeU64(futureDeadline)
    .writeBool(false)
    .writeBool(false)
    .writeBool(false)
    .writeBool(false)
    .writeU64(0n);

  const client = new MergePayClient({
    rpc: {
      getSignaturesForAddressPage: async () => [
        { signature, blockHeight: 12n, blockTime: 1_787_941_094n },
      ],
      getTransaction: async () => ({
        blockHeight: 12n,
        blockTime: 1_787_941_094n,
        transaction: {
          signatures: [signature],
          validFrom: 1_787_941_000_000n,
          message: {
            accountKeys: [payer, openWorkflow, "11111111111111111111111111111111", "Subscriber111111111111111111111111111111111", MERGEPAY_PROGRAM_ID],
            instructions: [
              {
                programIdIndex: 4,
                accounts: [0, 1],
                data: Buffer.from(instructionBytes).toString("base64"),
              },
            ],
          },
        },
        meta: { fee: 100n },
      }),
      getAccountInfo: async () => ({
        address: openWorkflow,
        kelvin: 1_000_000n,
        owner: MERGEPAY_PROGRAM_ID,
        data: stateWriter.toBytes(),
        executable: false,
        rentEpoch: 0n,
        space: BigInt(stateWriter.toBytes().length),
      }),
    },
  });

  const page = await client.getPublicBountiesPage();
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].status, "open");
  assert.equal(page.scannedTransactions, 1);
  assert.equal(page.nextBefore, null);
  assert.equal(page.hasMore, false);

  const bounties = await client.getOpenBounties(100);
  assert.equal(bounties.length, 1);
  assert.equal(bounties[0].workflow.address, openWorkflow);
  assert.equal(bounties[0].workflow.state.githubOwner, "Alice699");
  assert.equal(bounties[0].workflowSlug, Buffer.from(slugBytes).toString("hex"));
});

test("excludes legacy create instructions from public discovery", async () => {
  const signature =
    "5njvCt6ESqPsasd8C19oNAu6PffAS1ZdR9Wii8wWRetFzezhqQZyDPop8cWmnq48dBq3qjq9TEd5sAUzqgBmXwzF";
  const legacySlugBytes = Uint8Array.from({ length: 32 }, (_, index) => index + 41);
  const legacyWorkflow = deriveWorkflowPda(
    MERGEPAY_PROGRAM_ID,
    payer,
    Buffer.from(legacySlugBytes).toString("hex"),
  ).address;
  const instructionBytes = new Uint8Array(37);
  instructionBytes.set([5, 0, 0, 0], 0);
  instructionBytes.set(legacySlugBytes, 4);

  const client = new MergePayClient({
    rpc: {
      getSignaturesForAddressPage: async () => [
        { signature, blockHeight: 13n, blockTime: 1_787_941_095n },
      ],
      getTransaction: async () => ({
        blockHeight: 13n,
        blockTime: 1_787_941_095n,
        transaction: {
          signatures: [signature],
          validFrom: 1_787_941_000_000n,
          message: {
            accountKeys: [payer, legacyWorkflow, "11111111111111111111111111111111", "Subscriber111111111111111111111111111111111", MERGEPAY_PROGRAM_ID],
            instructions: [
              {
                programIdIndex: 4,
                accounts: [0, 1],
                data: Buffer.from(instructionBytes).toString("base64"),
              },
            ],
          },
        },
        meta: { fee: 100n },
      }),
    },
  });

  const page = await client.getPublicBountiesPage();
  assert.deepEqual(page.items, []);
  assert.equal(page.scannedTransactions, 1);
});
