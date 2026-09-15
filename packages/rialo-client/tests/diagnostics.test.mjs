import assert from "node:assert/strict";
import test from "node:test";
import {
  MERGEPAY_PROGRAM_ID,
  MERGEPAY_UNASSIGNED_BENEFICIARY,
  MergePayClient,
  buildCheckMergeInstruction,
  buildCreateBountyInstruction,
  buildFundInstruction,
  deriveWorkflowPda,
} from "../dist/index.js";

const sponsor = "2RGascNSeBgUxpkk57zQzQSeBZoUBiuT1HSRtuKTatEo";
const beneficiary = "5wk6cLsYjhYSpr7brqtJ7xnvzbh1zvUpoSxeivbjyEkd";

function workflow(slug, overrides = {}) {
  const address = deriveWorkflowPda(MERGEPAY_PROGRAM_ID, sponsor, slug).address;
  return {
    address,
    account: {
      address,
      kelvin: 1_000_000_000n,
      owner: MERGEPAY_PROGRAM_ID,
      data: new Uint8Array(),
      executable: false,
      rentEpoch: 0n,
      space: 256n,
    },
    state: {
      discriminator: 1n,
      nextBranchNumber: 1n,
      initialized: true,
      sponsor,
      beneficiary,
      githubOwner: "Alice699",
      githubRepo: "mergepay-demo",
      pullNumber: 7n,
      amountKelvin: 1_000_000_000n,
      deadlineUnixMs: BigInt(Date.now() + 86_400_000),
      funded: true,
      mergeConfirmed: false,
      paid: false,
      refunded: false,
      checks: 0n,
      claimRequest: false,
      claimTarget: MERGEPAY_UNASSIGNED_BENEFICIARY,
      claimantGithub: "biawaklahat",
      claimantGithubId: 136351960n,
      ...overrides,
    },
  };
}

function createInstruction(slug, deadlineUnixMs) {
  return buildCreateBountyInstruction({
    payer: sponsor,
    programId: MERGEPAY_PROGRAM_ID,
    workflowSlug: slug,
    beneficiary: MERGEPAY_UNASSIGNED_BENEFICIARY,
    githubOwner: "Alice699",
    githubRepo: "mergepay-demo",
    pullNumber: 7n,
    amountKelvin: 1_000_000_000n,
    deadlineUnixMs,
  });
}

function transaction(
  signature,
  instruction,
  blockHeight,
  blockTime,
  err = null,
  logMessages = [],
) {
  const accountKeys = instruction.accounts.map((account) =>
    account.pubkey.toString(),
  );
  accountKeys.push(MERGEPAY_PROGRAM_ID);
  return {
    blockHeight,
    blockTime,
    transaction: {
      signatures: [signature],
      validFrom: blockTime * 1_000n,
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
    meta: {
      fee: 100n,
      ...(err ? { err } : {}),
      ...(logMessages.length > 0 ? { logMessages } : {}),
    },
  };
}

test("keeps overdue, terminal, and unavailable workflows visible in diagnostics", async () => {
  const now = Date.now();
  const nowSeconds = BigInt(Math.floor(now / 1_000));
  const slugs = ["1", "2", "3"].map((suffix) => suffix.padStart(64, "0"));
  const [overdueSlug, paidSlug, missingSlug] = slugs;
  const overdue = workflow(overdueSlug, {
    checks: 2n,
    deadlineUnixMs: BigInt(now - 60_000),
  });
  const paid = workflow(paidSlug, {
    mergeConfirmed: true,
    paid: true,
  });
  const missingAddress = deriveWorkflowPda(
    MERGEPAY_PROGRAM_ID,
    sponsor,
    missingSlug,
  ).address;

  const creationRecords = slugs.map((slug, index) => {
    const signature = `create-${index + 1}`;
    const instruction = createInstruction(slug, BigInt(now + 86_400_000));
    return {
      address: deriveWorkflowPda(MERGEPAY_PROGRAM_ID, sponsor, slug).address,
      signature: {
        signature,
        blockHeight: BigInt(300 - index),
        blockTime: nowSeconds - BigInt(index * 60),
      },
      transaction: transaction(
        signature,
        instruction,
        BigInt(300 - index),
        nowSeconds - BigInt(index * 60),
      ),
    };
  });
  const overdueCheck = buildCheckMergeInstruction({
    payer: sponsor,
    programId: MERGEPAY_PROGRAM_ID,
    workflowSlug: overdueSlug,
    branchNumber: 1,
  });
  const paidFund = buildFundInstruction({
    payer: sponsor,
    programId: MERGEPAY_PROGRAM_ID,
    workflowSlug: paidSlug,
  });
  const latestByAddress = new Map([
    [
      overdue.address,
      {
        signature: "overdue-check",
        blockHeight: 310n,
        blockTime: nowSeconds - 900n,
      },
    ],
    [
      paid.address,
      {
        signature: "paid-fund",
        blockHeight: 309n,
        blockTime: nowSeconds - 600n,
      },
    ],
    [missingAddress, creationRecords[2].signature],
  ]);
  const transactions = new Map(
    creationRecords.map((record) => [record.signature.signature, record.transaction]),
  );
  transactions.set(
    "overdue-check",
    transaction("overdue-check", overdueCheck, 310n, nowSeconds - 900n),
  );
  transactions.set(
    "paid-fund",
    transaction("paid-fund", paidFund, 309n, nowSeconds - 600n),
  );

  const client = new MergePayClient({
    rpc: {
      getSignaturesForAddressPage: async (address) =>
        address === MERGEPAY_PROGRAM_ID
          ? creationRecords.map((record) => record.signature)
          : latestByAddress.has(address)
            ? [latestByAddress.get(address)]
            : [],
      getTransaction: async (signature) => transactions.get(signature) ?? null,
    },
  });
  client.getWorkflowByAddress = async (address) => {
    if (address === overdue.address) return overdue;
    if (address === paid.address) return paid;
    if (address === missingAddress) return null;
    assert.fail(`Unexpected workflow address ${address}`);
  };

  const page = await client.getWorkflowDiagnosticsPage();

  assert.equal(page.items.length, 3);
  assert.equal(page.scannedTransactions, 3);
  assert.equal(page.incomplete, true);
  assert.equal(page.readErrors, 1);
  assert.equal(page.hasMore, false);
  assert.deepEqual(
    page.items.map(({ finding, lifecycle, severity }) => ({
      finding,
      lifecycle,
      severity,
    })),
    [
      {
        finding: "refund_overdue",
        lifecycle: "funded",
        severity: "critical",
      },
      { finding: "none", lifecycle: "paid", severity: "healthy" },
      {
        finding: "account_unavailable",
        lifecycle: "unavailable",
        severity: "critical",
      },
    ],
  );
  assert.equal(page.items[0].latestActivity?.action, "check_merge");
  assert.match(page.items[2].readError, /not currently available/);
});

test("surfaces stale merge checks and failed latest transactions without changing state", async () => {
  const now = Date.now();
  const nowSeconds = BigInt(Math.floor(now / 1_000));
  const reviewSlug = "4".padStart(64, "0");
  const failedSlug = "5".padStart(64, "0");
  const review = workflow(reviewSlug, { checks: 3n });
  const failed = workflow(failedSlug, {
    beneficiary: MERGEPAY_UNASSIGNED_BENEFICIARY,
    funded: false,
  });
  const records = [reviewSlug, failedSlug].map((slug, index) => {
    const signature = `create-review-${index}`;
    const instruction = createInstruction(slug, BigInt(now + 86_400_000));
    return {
      signature: {
        signature,
        blockHeight: BigInt(200 - index),
        blockTime: nowSeconds - BigInt(index),
      },
      transaction: transaction(
        signature,
        instruction,
        BigInt(200 - index),
        nowSeconds - BigInt(index),
      ),
    };
  });
  const reviewCheck = buildCheckMergeInstruction({
    payer: sponsor,
    programId: MERGEPAY_PROGRAM_ID,
    workflowSlug: reviewSlug,
    branchNumber: 2,
  });
  const failedFund = buildFundInstruction({
    payer: sponsor,
    programId: MERGEPAY_PROGRAM_ID,
    workflowSlug: failedSlug,
  });
  const latest = new Map([
    [
      review.address,
      {
        signature: "stale-check",
        blockHeight: 210n,
        blockTime: nowSeconds - 11n * 60n,
      },
    ],
    [
      failed.address,
      {
        signature: "failed-fund",
        blockHeight: 209n,
        blockTime: nowSeconds - 30n,
        err: "InstructionError",
      },
    ],
  ]);
  const transactions = new Map(
    records.map((record) => [record.signature.signature, record.transaction]),
  );
  transactions.set(
    "stale-check",
    transaction("stale-check", reviewCheck, 210n, nowSeconds - 11n * 60n),
  );
  transactions.set(
    "failed-fund",
    transaction(
      "failed-fund",
      failedFund,
      209n,
      nowSeconds - 30n,
      "InstructionError",
    ),
  );

  const client = new MergePayClient({
    rpc: {
      getSignaturesForAddressPage: async (address) =>
        address === MERGEPAY_PROGRAM_ID
          ? records.map((record) => record.signature)
          : latest.has(address)
            ? [latest.get(address)]
            : [],
      getTransaction: async (signature) => transactions.get(signature) ?? null,
    },
  });
  client.getWorkflowByAddress = async (address) => {
    if (address === review.address) return review;
    if (address === failed.address) return failed;
    return null;
  };

  const page = await client.getWorkflowDiagnosticsPage();

  assert.equal(page.incomplete, false);
  assert.equal(page.readErrors, 0);
  assert.equal(page.items[0].finding, "check_needs_review");
  assert.equal(page.items[0].severity, "warning");
  assert.equal(page.items[1].finding, "transaction_failed");
  assert.equal(page.items[1].severity, "warning");
  assert.equal(page.items[1].latestActivity?.error, "InstructionError");
});

test("marks a valid workflow when its latest activity read is incomplete", async () => {
  const now = Date.now();
  const nowSeconds = BigInt(Math.floor(now / 1_000));
  const slug = "6".padStart(64, "0");
  const verifiedWorkflow = workflow(slug);
  const signature = "create-read-incomplete";
  const instruction = createInstruction(slug, BigInt(now + 86_400_000));
  const creationSignature = {
    signature,
    blockHeight: 100n,
    blockTime: nowSeconds,
  };
  const client = new MergePayClient({
    rpc: {
      getSignaturesForAddressPage: async (address) => {
        if (address === MERGEPAY_PROGRAM_ID) return [creationSignature];
        throw new Error("activity RPC timed out");
      },
      getTransaction: async (requestedSignature) =>
        requestedSignature === signature
          ? transaction(signature, instruction, 100n, nowSeconds)
          : null,
    },
  });
  client.getWorkflowByAddress = async () => verifiedWorkflow;

  const page = await client.getWorkflowDiagnosticsPage();

  assert.equal(page.incomplete, true);
  assert.equal(page.readErrors, 1);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].lifecycle, "funded");
  assert.equal(page.items[0].finding, "read_incomplete");
  assert.equal(page.items[0].severity, "warning");
  assert.match(page.items[0].readError, /activity RPC timed out/);
});

test("distinguishes repeated inconclusive REX reports from not-merged proof", async () => {
  const now = Date.now();
  const nowSeconds = BigInt(Math.floor(now / 1_000));
  const inconclusiveSlug = "7".padStart(64, "0");
  const notMergedSlug = "8".padStart(64, "0");
  const inconclusiveWorkflow = workflow(inconclusiveSlug, { checks: 2n });
  const notMergedWorkflow = workflow(notMergedSlug, { checks: 1n });
  const workflows = new Map([
    [inconclusiveWorkflow.address, inconclusiveWorkflow],
    [notMergedWorkflow.address, notMergedWorkflow],
  ]);
  const creationRecords = [inconclusiveSlug, notMergedSlug].map(
    (slug, index) => {
      const signature = `create-rex-${index}`;
      const instruction = createInstruction(slug, BigInt(now + 86_400_000));
      return {
        address: deriveWorkflowPda(MERGEPAY_PROGRAM_ID, sponsor, slug).address,
        signature: {
          signature,
          blockHeight: BigInt(80 - index),
          blockTime: nowSeconds - BigInt(index),
        },
        transaction: transaction(
          signature,
          instruction,
          BigInt(80 - index),
          nowSeconds - BigInt(index),
        ),
      };
    },
  );
  const inconclusiveCheck = buildCheckMergeInstruction({
    payer: sponsor,
    programId: MERGEPAY_PROGRAM_ID,
    workflowSlug: inconclusiveSlug,
    branchNumber: 2,
  });
  const notMergedCheck = buildCheckMergeInstruction({
    payer: sponsor,
    programId: MERGEPAY_PROGRAM_ID,
    workflowSlug: notMergedSlug,
    branchNumber: 1,
  });
  const workflowSignatures = new Map([
    [
      inconclusiveWorkflow.address,
      [
        { signature: "rex-empty", blockHeight: 91n, blockTime: nowSeconds - 5n },
        { signature: "rex-timeout", blockHeight: 90n, blockTime: nowSeconds - 35n },
      ],
    ],
    [
      notMergedWorkflow.address,
      [{ signature: "rex-not-merged", blockHeight: 89n, blockTime: nowSeconds - 10n }],
    ],
  ]);
  const transactions = new Map(
    creationRecords.map((record) => [record.signature.signature, record.transaction]),
  );
  transactions.set(
    "rex-empty",
    transaction(
      "rex-empty",
      inconclusiveCheck,
      91n,
      nowSeconds - 5n,
      null,
      ["Program log: MergePay received an empty REX report"],
    ),
  );
  transactions.set(
    "rex-timeout",
    transaction(
      "rex-timeout",
      inconclusiveCheck,
      90n,
      nowSeconds - 35n,
      null,
      ["Program log: MergePay inconclusive REX error: timed out"],
    ),
  );
  transactions.set(
    "rex-not-merged",
    transaction(
      "rex-not-merged",
      notMergedCheck,
      89n,
      nowSeconds - 10n,
      null,
      ["Program log: MergePay PR is not merged; escrow remains locked"],
    ),
  );

  const client = new MergePayClient({
    rpc: {
      getSignaturesForAddressPage: async (address) =>
        address === MERGEPAY_PROGRAM_ID
          ? creationRecords.map((record) => record.signature)
          : workflowSignatures.get(address) ?? [],
      getTransaction: async (signature) => transactions.get(signature) ?? null,
    },
  });
  client.getWorkflowByAddress = async (address) => workflows.get(address) ?? null;

  const page = await client.getWorkflowDiagnosticsPage();
  const repeated = page.items.find(
    ({ workflowAddress }) => workflowAddress === inconclusiveWorkflow.address,
  );
  const negativeProof = page.items.find(
    ({ workflowAddress }) => workflowAddress === notMergedWorkflow.address,
  );

  assert.equal(repeated?.finding, "rex_failures_repeated");
  assert.equal(repeated?.severity, "warning");
  assert.equal(repeated?.reliability.inconclusiveRexReports, 2);
  assert.equal(repeated?.reliability.latestRexSignal, "inconclusive");
  assert.equal(negativeProof?.finding, "none");
  assert.equal(negativeProof?.severity, "healthy");
  assert.equal(negativeProof?.reliability.notMergedRexReports, 1);
  assert.equal(negativeProof?.reliability.latestRexSignal, "not_merged");
  assert.match(negativeProof?.message ?? "", /not merged/i);
});
