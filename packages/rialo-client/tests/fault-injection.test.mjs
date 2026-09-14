import assert from "node:assert/strict";
import test from "node:test";
import {
  MERGEPAY_PROGRAM_ID,
  MergePayClient,
  buildCheckMergeInstruction,
  buildFundInstruction,
  deriveWorkflowPda,
} from "../dist/index.js";

const sponsor = "2RGascNSeBgUxpkk57zQzQSeBZoUBiuT1HSRtuKTatEo";
const beneficiary = "5wk6cLsYjhYSpr7brqtJ7xnvzbh1zvUpoSxeivbjyEkd";
const slug = "00000000000000000000000000000000000000000000000000000000000000ff";
const workflowAddress = deriveWorkflowPda(
  MERGEPAY_PROGRAM_ID,
  sponsor,
  slug,
).address;

function transaction(signature, instruction, blockHeight) {
  const accountKeys = instruction.accounts.map((account) =>
    account.pubkey.toString(),
  );
  accountKeys.push(MERGEPAY_PROGRAM_ID);
  return {
    blockHeight,
    blockTime: 1_900_000_000n + blockHeight,
    transaction: {
      signatures: [signature],
      validFrom: 1_900_000_000_000n,
      message: {
        accountKeys,
        instructions: [
          {
            programIdIndex: accountKeys.length - 1,
            accounts: instruction.accounts.map((_, index) => index),
            data: Buffer.from(instruction.data).toString("base64"),
          },
        ],
      },
    },
    meta: { fee: 100n },
  };
}

test("deduplicates one terminal workflow across repeated actions and isolates RPC faults", async () => {
  const fund = buildFundInstruction({
    payer: sponsor,
    programId: MERGEPAY_PROGRAM_ID,
    workflowSlug: slug,
  });
  const check = buildCheckMergeInstruction({
    payer: sponsor,
    programId: MERGEPAY_PROGRAM_ID,
    workflowSlug: slug,
    branchNumber: 4,
  });
  const signatures = [
    { signature: "callback-action", blockHeight: 104n, blockTime: 1_900_000_104n },
    { signature: "fund-action", blockHeight: 103n, blockTime: 1_900_000_103n },
    { signature: "rate-limited-read", blockHeight: 102n, blockTime: 1_900_000_102n },
    { signature: "timed-out-read", blockHeight: 101n, blockTime: 1_900_000_101n },
  ];
  const transactions = new Map([
    ["callback-action", transaction("callback-action", check, 104n)],
    ["fund-action", transaction("fund-action", fund, 103n)],
  ]);
  let workflowReads = 0;
  const client = new MergePayClient({
    rpc: {
      getSignaturesForAddressPage: async () => signatures,
      getTransaction: async (signature) => {
        if (signature === "rate-limited-read") {
          throw new Error("HTTP 429 rate limit");
        }
        if (signature === "timed-out-read") {
          throw new Error("RPC request timed out");
        }
        return transactions.get(signature) ?? null;
      },
    },
  });
  client.getWorkflowByAddress = async (address) => {
    workflowReads += 1;
    assert.equal(address, workflowAddress);
    return {
      address: workflowAddress,
      state: {
        sponsor,
        beneficiary,
        claimRequest: false,
        funded: true,
        mergeConfirmed: true,
        paid: true,
        refunded: false,
        githubOwner: "Alice699",
        githubRepo: "mergepay-demo",
        pullNumber: 7n,
        amountKelvin: 1_000_000_000n,
      },
    };
  };

  const page = await client.getWalletSettlementPage(sponsor, { limit: 6 });

  assert.equal(page.items.length, 1);
  assert.equal(page.items[0]?.workflowAddress, workflowAddress);
  assert.equal(page.items[0]?.outcome, "paid");
  assert.equal(page.incomplete, true);
  assert.equal(page.readErrors, 2);
  assert.equal(workflowReads, 1, "duplicate actions must share one workflow read");
});

test("never projects inconsistent terminal account flags as a receipt", async () => {
  const fund = buildFundInstruction({
    payer: sponsor,
    programId: MERGEPAY_PROGRAM_ID,
    workflowSlug: slug,
  });
  const signature = "inconsistent-terminal-state";
  for (const terminalState of [
    { funded: true, mergeConfirmed: true, paid: true, refunded: true },
    { funded: false, mergeConfirmed: false, paid: false, refunded: true },
    { funded: true, mergeConfirmed: false, paid: true, refunded: false },
  ]) {
    const client = new MergePayClient({
      rpc: {
        getSignaturesForAddressPage: async () => [
          { signature, blockHeight: 1n, blockTime: 1_900_000_001n },
        ],
        getTransaction: async () => transaction(signature, fund, 1n),
      },
    });
    client.getWorkflowByAddress = async () => ({
      address: workflowAddress,
      state: {
        sponsor,
        beneficiary,
        claimRequest: false,
        githubOwner: "Alice699",
        githubRepo: "mergepay-demo",
        pullNumber: 7n,
        amountKelvin: 1_000_000_000n,
        ...terminalState,
      },
    });
    const page = await client.getWalletSettlementPage(sponsor, { limit: 1 });
    assert.deepEqual(page.items, []);
  }
});
