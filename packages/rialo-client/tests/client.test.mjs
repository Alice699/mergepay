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
  buildPrepareFundingInstruction,
  buildRefundInstruction,
  buildRequestClaimInstruction,
  buildUnsignedTransaction,
  decodeWorkflowState,
  deriveCheckMergeAccounts,
  deriveCheckMergeControlAccounts,
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
const rexBytecodeAccount = beneficiary;
const settlementPolicy = {
  expectedHeadSha: "a".repeat(40),
  expectedBaseRef: "main",
  requireCiSuccess: true,
  minimumApprovals: 2n,
  rexBytecodeAccount,
};

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
    ["workflow_pda_slug"],
  );
  assert.deepEqual(
    manifest.instructions.prepare_funding.parameters.map((parameter) => parameter.name),
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
    [
      "payer",
      "workflow_pda",
      "system_program",
      "subscriber_interface",
      "target_workflow",
    ],
  );
  assert.deepEqual(
    manifest.instructions.create_bounty.parameters.map((parameter) => parameter.name),
    [
      "workflow_pda_slug",
      "beneficiary",
      "github_owner",
      "github_repo",
      "pull_number",
      "amount_kelvin",
      "deadline_unix_ms",
      "expected_head_sha",
      "expected_base_ref",
      "require_ci_success",
      "minimum_approvals",
      "__rex_bytecode_account",
    ],
  );
  assert.deepEqual(
    manifest.instructions.accept_claim.accounts.map((account) => account.name),
    [
      "payer",
      "workflow_pda",
      "system_program",
      "subscriber_interface",
      "claim_workflow",
    ],
  );
});

test("derives the workflow and merge-check callback auxiliary PDAs from the ABI", () => {
  assert.deepEqual(deriveWorkflowPda(MERGEPAY_PROGRAM_ID, payer, slug), {
    address: workflowPda,
    bump: 253,
  });

  const accounts = deriveCheckMergeAccounts(MERGEPAY_PROGRAM_ID, payer, slug);
  assert.equal(accounts.subscription.address, "GAbKXcuNsQhPEYNZcWuM1bHXzKWiaJ1YikJUbLjfKCNx");
  assert.equal(accounts.retrySubscription.address, "B4ZDyJVpWQyeabBPsJbK4PtSjH8ALxCocmARCQqLfjfn");
  assert.equal(accounts.rex.address, "9frhs8e36X2zwMQdiKfVsVrxaTbJUHSNzXZpnp3pq85q");
  assert.equal(
    Buffer.from(accounts.subscriptionSlug).toString("hex"),
    "6982149ae4370f94e82f3673736a30cf945a3054c1df310d79433cb5bf3441f1",
  );
  assert.equal(
    Buffer.from(accounts.rexSlug).toString("hex"),
    "c12194c7066fea7265fac498b386e3a04f2907c85d78df56b645e59662983353",
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

  const controlAccounts = deriveCheckMergeControlAccounts(
    MERGEPAY_PROGRAM_ID,
    payer,
    slug,
  );
  assert.equal(
    Buffer.from(controlAccounts.subscriptionSlug).toString("hex"),
    Buffer.from(deriveMultiAccountSlug(workflowPda, 0, 4)).toString("hex"),
  );
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
    `02000000${slug}`,
  );
  assert.deepEqual(check.accounts.map((account) => account.pubkey.toString()), [
    payer,
    workflowPda,
    "11111111111111111111111111111111",
    "Subscriber111111111111111111111111111111111",
    deriveCheckMergeControlAccounts(MERGEPAY_PROGRAM_ID, payer, slug).subscription.address,
  ]);

  const retryCheck = buildCheckMergeInstruction({ ...base, branchNumber: 1 });
  assert.equal(
    Buffer.from(retryCheck.data).toString("hex"),
    `02000000${slug}`,
  );
  assert.deepEqual(retryCheck.accounts.map((account) => account.pubkey.toString()), [
    payer,
    workflowPda,
    "11111111111111111111111111111111",
    "Subscriber111111111111111111111111111111111",
    deriveCheckMergeControlAccounts(MERGEPAY_PROGRAM_ID, payer, slug).subscription.address,
  ]);

  const create = buildCreateBountyInstruction({
    ...base,
    beneficiary,
    githubOwner: "microsoft",
    githubRepo: "vscode",
    pullNumber: 332677n,
    amountKelvin: 1_000_000n,
    deadlineUnixMs: 1_787_941_094_399n,
    ...settlementPolicy,
  });
  assert.equal(create.data.length, 224);
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
  const prepareFunding = buildPrepareFundingInstruction({
    ...base,
    githubAuthCiphertext,
  });
  assert.equal(
    Buffer.from(prepareFunding.data.slice(0, 4)).toString("hex"),
    "03000000",
  );
  assert.equal(
    Buffer.from(prepareFunding.data.slice(36, 44)).readBigUInt64LE(),
    13n,
  );
  assert.deepEqual(prepareFunding.data.slice(44), githubAuthCiphertext);
  assert.deepEqual(
    prepareFunding.accounts.map((account) => account.pubkey.toString()),
    [
      payer,
      workflowPda,
      "11111111111111111111111111111111",
      "Subscriber111111111111111111111111111111111",
    ],
  );

  const fund = buildFundInstruction(base);
  assert.equal(Buffer.from(fund.data.slice(0, 4)).toString("hex"), "01000000");
  assert.equal(fund.data.length, 36);
  assert.deepEqual(fund.accounts.map((account) => account.pubkey.toString()), [
    payer,
    workflowPda,
    "11111111111111111111111111111111",
    "Subscriber111111111111111111111111111111111",
    "HGeGQBQ4HjmuP5SCKAXGFkfVQTXoqVBpAJTUmmZosg8W",
  ]);

  const refund = buildRefundInstruction(base);
  assert.equal(Buffer.from(refund.data.slice(0, 4)).toString("hex"), "09000000");
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
    rexBytecodeAccount,
  });
  assert.equal(Buffer.from(request.data.slice(0, 4)).toString("hex"), "05000000");
  assert.equal(Buffer.from(request.data.slice(-40, -32)).readBigUInt64LE(), 123456789n);
  assert.deepEqual(
    request.data.slice(-32),
    PublicKey.fromString(rexBytecodeAccount).toBytes(),
  );
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

  assert.throws(
    () =>
      buildCreateBountyInstruction({
        ...base,
        beneficiary,
        githubOwner: "microsoft",
        githubRepo: "vscode",
        pullNumber: 332677n,
        amountKelvin: 1_000_000n,
        deadlineUnixMs: 1_787_941_094_399n,
        ...settlementPolicy,
        rexBytecodeAccount: "11111111111111111111111111111111",
      }),
    /REX bytecode account must be configured/,
  );
  assert.throws(
    () =>
      buildRequestClaimInstruction({
        programId: MERGEPAY_PROGRAM_ID,
        payer,
        workflowSlug: claimSlug,
        targetWorkflow: workflowPda,
        claimantGithub: "Alice699",
        claimantGithubId: 123456789,
        rexBytecodeAccount: "11111111111111111111111111111111",
      }),
    /REX bytecode account must be configured/,
  );
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
    .writeU64(987654321n)
    .writeVecBytes(Uint8Array.from([2, 1]))
    .writeVecBytes(Uint8Array.from([2, 2]))
    .writeU64(1_900_000_000_000n)
    .writeString(settlementPolicy.expectedHeadSha)
    .writeString(settlementPolicy.expectedBaseRef)
    .writeBool(settlementPolicy.requireCiSuccess)
    .writeU64(settlementPolicy.minimumApprovals)
    .writeU64(6n)
    .writeString(settlementPolicy.expectedHeadSha)
    .writeString(settlementPolicy.expectedBaseRef.padEnd(128, "\0"))
    .writeString("b".repeat(40))
    .writeBool(true)
    .writeU64(3n)
    .writeU64(1_900_000_100_000n)
    .writeFixedArray(PublicKey.fromString(rexBytecodeAccount).toBytes(), 32);

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
      expectedHeadSha: state.expectedHeadSha,
      expectedBaseRef: state.expectedBaseRef,
      requireCiSuccess: state.requireCiSuccess,
      minimumApprovals: state.minimumApprovals,
      proofStatus: state.proofStatus,
      proofHeadSha: state.proofHeadSha,
      proofBaseRef: state.proofBaseRef,
      proofMergeCommitSha: state.proofMergeCommitSha,
      proofCiSuccess: state.proofCiSuccess,
      proofApprovals: state.proofApprovals,
      rexBytecodeAccount: state.rexBytecodeAccount,
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
      expectedHeadSha: settlementPolicy.expectedHeadSha,
      expectedBaseRef: "main",
      requireCiSuccess: true,
      minimumApprovals: 2n,
      proofStatus: 6,
      proofHeadSha: settlementPolicy.expectedHeadSha,
      proofBaseRef: settlementPolicy.expectedBaseRef,
      proofMergeCommitSha: "b".repeat(40),
      proofCiSuccess: true,
      proofApprovals: 3n,
      rexBytecodeAccount,
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

test("paginates wallet activity with a Rialo cursor and look-ahead", async () => {
  const requests = [];
  const signatures = [
    { signature: "newest-signature", blockHeight: 15n, blockTime: 1_787_941_096n },
    { signature: "page-boundary-signature", blockHeight: 14n, blockTime: 1_787_941_095n },
    { signature: "look-ahead-signature", blockHeight: 13n, blockTime: 1_787_941_094n },
  ];
  const activityClient = new MergePayClient({
    rpc: {
      getSignaturesForAddressPage: async (address, limit, before) => {
        requests.push({ address, before, limit });
        return signatures;
      },
      getTransaction: async () => null,
    },
  });

  const page = await activityClient.getWalletActivityPage(payer, {
    before: "previous-page-cursor",
    limit: 2,
  });

  assert.deepEqual(requests, [
    { address: payer, before: "previous-page-cursor", limit: 3 },
  ]);
  assert.deepEqual(
    page.items.map((item) => item.signature),
    ["newest-signature", "page-boundary-signature"],
  );
  assert.equal(page.hasMore, true);
  assert.equal(page.nextBefore, "page-boundary-signature");
});

test("discovers every valid claim request and rejects mismatched records", async () => {
  const signature = "detected-claim-signature";
  const secondSignature = "second-detected-claim-signature";
  const secondClaimSlug =
    "000000000000000000000000000000000000000000000000000000000000000b";
  const claimPda = deriveWorkflowPda(
    MERGEPAY_PROGRAM_ID,
    beneficiary,
    claimSlug,
  ).address;
  const secondClaimPda = deriveWorkflowPda(
    MERGEPAY_PROGRAM_ID,
    beneficiary,
    secondClaimSlug,
  ).address;
  const requestClaimInstruction = buildRequestClaimInstruction({
    programId: MERGEPAY_PROGRAM_ID,
    payer: beneficiary,
    workflowSlug: claimSlug,
    targetWorkflow: workflowPda,
    claimantGithub: "biawaklahat",
    claimantGithubId: 136351960n,
    rexBytecodeAccount,
  });
  const secondRequestClaimInstruction = buildRequestClaimInstruction({
    programId: MERGEPAY_PROGRAM_ID,
    payer: beneficiary,
    workflowSlug: secondClaimSlug,
    targetWorkflow: workflowPda,
    claimantGithub: "biawaklahat",
    claimantGithubId: 136351960n,
    rexBytecodeAccount,
  });
  const deadlineUnixMs = 1_800_000_000_000n;
  const bounty = {
    address: workflowPda,
    state: {
      sponsor: payer,
      githubOwner: "Alice699",
      githubRepo: "mergepay-demo",
      pullNumber: 6n,
      amountKelvin: 2_000_000n,
      deadlineUnixMs,
      ...settlementPolicy,
    },
  };
  const claim = {
    address: claimPda,
    state: {
      initialized: true,
      claimRequest: true,
      funded: false,
      mergeConfirmed: false,
      paid: false,
      refunded: false,
      claimTarget: workflowPda,
      sponsor: payer,
      beneficiary,
      githubOwner: bounty.state.githubOwner,
      githubRepo: bounty.state.githubRepo,
      pullNumber: bounty.state.pullNumber,
      amountKelvin: bounty.state.amountKelvin,
      deadlineUnixMs,
      claimantGithub: "biawaklahat",
      claimantGithubId: 136351960n,
      ...settlementPolicy,
    },
  };
  const secondClaim = { ...claim, address: secondClaimPda };
  const requests = [];
  const requestClaimAccountKeys = requestClaimInstruction.accounts.map(
    (account) => account.pubkey.toString(),
  );
  const secondRequestClaimAccountKeys = secondRequestClaimInstruction.accounts.map(
    (account) => account.pubkey.toString(),
  );
  const client = new MergePayClient({
    rpc: {
      getSignaturesForAddressPage: async (address, limit, before) => {
        requests.push({ address, before, limit });
        return [
          { signature, blockHeight: 22n, blockTime: 1_787_941_102n },
          {
            signature: secondSignature,
            blockHeight: 21n,
            blockTime: 1_787_941_101n,
          },
        ];
      },
      getTransaction: async (requestedSignature) => ({
        blockHeight: requestedSignature === signature ? 22n : 21n,
        blockTime:
          requestedSignature === signature ? 1_787_941_102n : 1_787_941_101n,
        transaction: {
          signatures: [requestedSignature],
          validFrom: 1_787_941_000_000n,
          message: {
            accountKeys: [
              ...(requestedSignature === signature
                ? requestClaimAccountKeys
                : secondRequestClaimAccountKeys),
              MERGEPAY_PROGRAM_ID,
            ],
            instructions: [
              {
                programIdIndex: 4,
                accounts: [0, 1, 2, 3],
                data: Buffer.from(
                  requestedSignature === signature
                    ? requestClaimInstruction.data
                    : secondRequestClaimInstruction.data,
                ).toString("base64"),
              },
            ],
          },
        },
        meta: { fee: 100n },
      }),
    },
  });
  client.getWorkflowByAddress = async (address) => {
    if (address === claimPda) return claim;
    if (address === secondClaimPda) return secondClaim;
    assert.fail(`Unexpected claim address ${address}`);
  };

  const result = await client.findClaimRequests(bounty);

  assert.deepEqual(requests, [
    { address: workflowPda, before: undefined, limit: 12 },
  ]);
  assert.deepEqual(
    result.map((request) => request.signature),
    [signature, secondSignature],
  );
  assert.deepEqual(
    result.map((request) => request.claim.address),
    [claimPda, secondClaimPda],
  );
  assert.equal(result[0]?.claim.state.beneficiary, beneficiary);

  client.getWorkflowByAddress = async () => ({
    ...claim,
    state: {
      ...claim.state,
      amountKelvin: claim.state.amountKelvin + 1n,
    },
  });
  const mismatchedResult = await client.findClaimRequests(bounty);
  assert.deepEqual(mismatchedResult, []);

  client.getWorkflowByAddress = async () => ({
    ...claim,
    state: {
      ...claim.state,
      expectedHeadSha: "c".repeat(40),
    },
  });
  const policyMismatchedResult = await client.findClaimRequests(bounty);
  assert.deepEqual(policyMismatchedResult, []);
});

test("projects terminal workflow state into paid and refunded wallet settlements", async () => {
  const terminalWorkflow = {
    address: workflowPda,
    state: {
      sponsor: payer,
      beneficiary,
      claimRequest: false,
      funded: true,
      mergeConfirmed: true,
      paid: true,
      refunded: false,
      githubOwner: "microsoft",
      githubRepo: "vscode",
      pullNumber: 332677n,
      amountKelvin: 1_000_000n,
    },
  };
  const fundInstruction = buildFundInstruction({
    programId: MERGEPAY_PROGRAM_ID,
    payer,
    workflowSlug: slug,
  });
  const paidClient = new MergePayClient({
    rpc: {
      getSignaturesForAddressPage: async () => [
        { signature: "paid-signature", blockHeight: 20n, blockTime: 1_787_941_100n },
      ],
      getTransaction: async () => ({
        blockHeight: 20n,
        blockTime: 1_787_941_100n,
        transaction: {
          signatures: ["paid-signature"],
          validFrom: 1_787_941_000_000n,
          message: {
            accountKeys: [payer, workflowPda, MERGEPAY_PROGRAM_ID],
            instructions: [
              {
                programIdIndex: 2,
                accounts: [0, 1],
                data: Buffer.from(fundInstruction.data).toString("base64"),
              },
            ],
          },
        },
        meta: { fee: 100n },
      }),
    },
  });
  paidClient.getWorkflowByAddress = async () => terminalWorkflow;

  const paidPage = await paidClient.getWalletSettlementPage(payer, { limit: 1 });
  assert.equal(paidPage.items[0]?.outcome, "paid");
  assert.equal(paidPage.items[0]?.role, "sponsor");
  assert.equal(paidPage.items[0]?.workflowSlug, slug);
  assert.equal(paidPage.incomplete, false);
  assert.equal(paidPage.readErrors, 0);

  const claimInstruction = buildRequestClaimInstruction({
    programId: MERGEPAY_PROGRAM_ID,
    payer: beneficiary,
    workflowSlug: claimSlug,
    targetWorkflow: workflowPda,
    claimantGithub: "biawaklahat",
    claimantGithubId: 136351960n,
    rexBytecodeAccount,
  });
  const refundedClient = new MergePayClient({
    rpc: {
      getSignaturesForAddressPage: async () => [
        { signature: "refunded-claim-signature", blockHeight: 21n, blockTime: 1_787_941_101n },
      ],
      getTransaction: async () => ({
        blockHeight: 21n,
        blockTime: 1_787_941_101n,
        transaction: {
          signatures: ["refunded-claim-signature"],
          validFrom: 1_787_941_000_000n,
          message: {
            accountKeys: [beneficiary, deriveWorkflowPda(MERGEPAY_PROGRAM_ID, beneficiary, claimSlug).address, workflowPda, MERGEPAY_PROGRAM_ID],
            instructions: [
              {
                programIdIndex: 3,
                accounts: [0, 1, 2],
                data: Buffer.from(claimInstruction.data).toString("base64"),
              },
            ],
          },
        },
        meta: { fee: 100n },
      }),
    },
  });
  refundedClient.getWorkflowByAddress = async () => ({
    ...terminalWorkflow,
    state: { ...terminalWorkflow.state, mergeConfirmed: false, paid: false, refunded: true },
  });

  const refundedPage = await refundedClient.getWalletSettlementPage(beneficiary, { limit: 1 });
  assert.equal(refundedPage.items[0]?.outcome, "refunded");
  assert.equal(refundedPage.items[0]?.role, "beneficiary");
  assert.equal(refundedPage.items[0]?.workflowAddress, workflowPda);
  assert.equal(refundedPage.items[0]?.workflowSlug, null);
  assert.equal(refundedPage.incomplete, false);
  assert.equal(refundedPage.readErrors, 0);
});

test("retries a transiently unavailable settlement transaction", async () => {
  const fundInstruction = buildFundInstruction({
    programId: MERGEPAY_PROGRAM_ID,
    payer,
    workflowSlug: slug,
  });
  const transaction = {
    blockHeight: 22n,
    blockTime: 1_787_941_102n,
    transaction: {
      signatures: ["recovering-signature"],
      validFrom: 1_787_941_000_000n,
      message: {
        accountKeys: [payer, workflowPda, MERGEPAY_PROGRAM_ID],
        instructions: [
          {
            programIdIndex: 2,
            accounts: [0, 1],
            data: Buffer.from(fundInstruction.data).toString("base64"),
          },
        ],
      },
    },
    meta: { fee: 100n },
  };
  let transactionReads = 0;
  const client = new MergePayClient({
    rpc: {
      getSignaturesForAddressPage: async () => [
        {
          signature: "recovering-signature",
          blockHeight: 22n,
          blockTime: 1_787_941_102n,
        },
      ],
      getTransaction: async () => {
        transactionReads += 1;
        return transactionReads === 1 ? null : transaction;
      },
    },
  });
  client.getWorkflowByAddress = async () => ({
    address: workflowPda,
    state: {
      sponsor: payer,
      beneficiary,
      claimRequest: false,
      funded: true,
      mergeConfirmed: true,
      paid: true,
      refunded: false,
      githubOwner: "microsoft",
      githubRepo: "vscode",
      pullNumber: 332677n,
      amountKelvin: 1_000_000n,
    },
  });

  const interrupted = await client.getWalletSettlementPage(payer, { limit: 1 });
  assert.equal(interrupted.items.length, 0);
  assert.equal(interrupted.incomplete, true);
  assert.equal(interrupted.readErrors, 1);

  const recovered = await client.getWalletSettlementPage(payer, { limit: 1 });
  assert.equal(recovered.items[0]?.outcome, "paid");
  assert.equal(recovered.incomplete, false);
  assert.equal(recovered.readErrors, 0);
  assert.equal(transactionReads, 2);
});

test("bounds settlement discovery and exposes older history through the cursor", async () => {
  const requests = [];
  const firstPage = Array.from({ length: 25 }, (_, index) => ({
    signature: `recent-${index}`,
    blockHeight: BigInt(200 - index),
    blockTime: 1_787_941_100n - BigInt(index),
  }));
  const secondPage = Array.from({ length: 25 }, (_, index) => ({
    signature: `older-${index}`,
    blockHeight: BigInt(100 - index),
    blockTime: 1_787_941_000n - BigInt(index),
  }));
  const client = new MergePayClient({
    rpc: {
      getSignaturesForAddressPage: async (address, limit, before) => {
        requests.push({ address, limit, before });
        return before ? secondPage : firstPage;
      },
      getTransaction: async () => null,
    },
  });

  const page = await client.getWalletSettlementPage(payer, { limit: 6 });

  assert.equal(page.items.length, 0);
  assert.equal(page.scannedTransactions, 48);
  assert.equal(page.hasMore, true);
  assert.equal(page.nextBefore, "older-23");
  assert.equal(page.incomplete, true);
  assert.equal(page.readErrors, 48);
  assert.deepEqual(requests, [
    { address: payer, limit: 25, before: undefined },
    { address: payer, limit: 25, before: "recent-23" },
  ]);
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

test("excludes unknown historical instructions from public discovery", async () => {
  const signature =
    "5njvCt6ESqPsasd8C19oNAu6PffAS1ZdR9Wii8wWRetFzezhqQZyDPop8cWmnq48dBq3qjq9TEd5sAUzqgBmXwzF";
  const legacySlugBytes = Uint8Array.from({ length: 32 }, (_, index) => index + 41);
  const legacyWorkflow = deriveWorkflowPda(
    MERGEPAY_PROGRAM_ID,
    payer,
    Buffer.from(legacySlugBytes).toString("hex"),
  ).address;
  const instructionBytes = new Uint8Array(37);
  instructionBytes.set([99, 0, 0, 0], 0);
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
