import assert from "node:assert/strict";
import test from "node:test";
import {
  BincodeWriter,
  MERGEPAY_PROGRAM_ID,
  MergePayClient,
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
const workflowPda = "8mQD6UHLuf3GxR64iwXVESWWZi3mhniM7stS24rtNSvU";

test("derives the workflow and check_merge auxiliary PDAs from the ABI", () => {
  assert.deepEqual(deriveWorkflowPda(MERGEPAY_PROGRAM_ID, payer, slug), {
    address: workflowPda,
    bump: 255,
  });

  const accounts = deriveCheckMergeAccounts(MERGEPAY_PROGRAM_ID, payer, slug);
  assert.equal(accounts.subscription.address, "4WoE3cuaB923Xhvx4ciyKacvGQfbqNPRc2Uw7qu9Ti4q");
  assert.equal(accounts.rex.address, "DGftcHqvFFDsYimEqEQi7db2eSFByyPfVj3AAwcPw7LZ");
  assert.equal(
    Buffer.from(accounts.subscriptionSlug).toString("hex"),
    "780c13ef6bcf64a41f306b6d86d5d25b7cd84bffa53c7c180862404e525b60e0",
  );
  assert.equal(
    Buffer.from(accounts.rexSlug).toString("hex"),
    "5d1daa7e7e5360723fbad2367efec9d12fe216d8c2978b9e0af84c7712a7cc0d",
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
    "4WoE3cuaB923Xhvx4ciyKacvGQfbqNPRc2Uw7qu9Ti4q",
    "DGftcHqvFFDsYimEqEQi7db2eSFByyPfVj3AAwcPw7LZ",
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
