import assert from "node:assert/strict";
import test from "node:test";
import {
  MERGEPAY_PROGRAM_ID,
  MERGEPAY_UNASSIGNED_BENEFICIARY,
  classifyWorkflowLifecycle,
  isWorkflowSnapshotProgression,
} from "../dist/index.js";

const sponsor = "2RGascNSeBgUxpkk57zQzQSeBZoUBiuT1HSRtuKTatEo";
const beneficiary = "5wk6cLsYjhYSpr7brqtJ7xnvzbh1zvUpoSxeivbjyEkd";
const workflowAddress = "4SkJFE2FqYhXDU4Wm4sGr5gL6jxnEfPbj8sR348qw";

function state(overrides = {}) {
  return {
    discriminator: 1n,
    nextBranchNumber: 1n,
    initialized: true,
    sponsor,
    beneficiary: MERGEPAY_UNASSIGNED_BENEFICIARY,
    githubOwner: "Alice699",
    githubRepo: "mergepay-demo",
    pullNumber: 7n,
    amountKelvin: 1_000_000_000n,
    deadlineUnixMs: 2_000_000_000_000n,
    funded: false,
    mergeConfirmed: false,
    paid: false,
    refunded: false,
    checks: 0n,
    claimRequest: false,
    claimTarget: MERGEPAY_UNASSIGNED_BENEFICIARY,
    claimantGithub: "",
    claimantGithubId: 0n,
    ...overrides,
  };
}

function workflow(workflowState, overrides = {}) {
  return {
    address: workflowAddress,
    account: {
      address: workflowAddress,
      kelvin: 2_500_000n,
      owner: MERGEPAY_PROGRAM_ID,
      data: new Uint8Array(),
      executable: false,
      rentEpoch: 0n,
      space: 512n,
      ...overrides,
    },
    state: workflowState,
  };
}

test("classifies the complete workflow lifecycle matrix", () => {
  const matrix = [
    [state({ initialized: false, discriminator: 0n }), "uninitialized"],
    [state(), "created"],
    [state({ beneficiary }), "claimed"],
    [state({ beneficiary, funded: true }), "funded"],
    [state({ beneficiary, funded: true, mergeConfirmed: true }), "merge_confirmed"],
    [state({ beneficiary, funded: true, mergeConfirmed: true, paid: true }), "paid"],
    [state({ beneficiary, funded: true, refunded: true }), "refunded"],
    [
      state({
        beneficiary,
        claimRequest: true,
        claimTarget: workflowAddress,
        claimantGithub: "contributor",
        claimantGithubId: 42n,
      }),
      "claim_request",
    ],
  ];

  for (const [workflowState, expected] of matrix) {
    assert.equal(classifyWorkflowLifecycle(workflowState), expected);
  }
});

test("rejects impossible terminal and escrow combinations", () => {
  const invalidStates = [
    state({ beneficiary, paid: true }),
    state({ beneficiary, mergeConfirmed: true }),
    state({ beneficiary, refunded: true }),
    state({ funded: true }),
    state({ beneficiary, funded: true, mergeConfirmed: true, refunded: true }),
    state({ beneficiary, funded: true, mergeConfirmed: true, paid: true, refunded: true }),
    state({ beneficiary, funded: true, claimRequest: true, claimTarget: workflowAddress }),
  ];

  for (const invalid of invalidStates) {
    assert.equal(classifyWorkflowLifecycle(invalid), "invalid");
    assert.equal(isWorkflowSnapshotProgression(null, workflow(invalid)), false);
  }
  assert.equal(isWorkflowSnapshotProgression(null, workflow(state())), true);
});

test("accepts forward snapshots even when polling skips intermediate states", () => {
  const created = workflow(state());
  const claimed = workflow(state({ beneficiary, claimantGithub: "contributor", claimantGithubId: 42n }));
  const funded = workflow(state({
    beneficiary,
    claimantGithub: "contributor",
    claimantGithubId: 42n,
    funded: true,
    nextBranchNumber: 3n,
    checks: 1n,
  }));
  const paid = workflow(state({
    beneficiary,
    claimantGithub: "contributor",
    claimantGithubId: 42n,
    funded: true,
    mergeConfirmed: true,
    paid: true,
    nextBranchNumber: 5n,
    checks: 2n,
  }));
  const refunded = workflow(state({
    beneficiary,
    claimantGithub: "contributor",
    claimantGithubId: 42n,
    funded: true,
    refunded: true,
    nextBranchNumber: 5n,
    checks: 2n,
  }));

  assert.equal(isWorkflowSnapshotProgression(created, claimed), true);
  assert.equal(isWorkflowSnapshotProgression(claimed, funded), true);
  assert.equal(isWorkflowSnapshotProgression(funded, paid), true);
  assert.equal(isWorkflowSnapshotProgression(created, paid), true);
  assert.equal(isWorkflowSnapshotProgression(funded, refunded), true);
});

test("rejects stale, terminal-reversing, and identity-mutated snapshots", () => {
  const claimedState = state({
    beneficiary,
    claimantGithub: "contributor",
    claimantGithubId: 42n,
  });
  const fundedState = state({
    ...claimedState,
    funded: true,
    nextBranchNumber: 4n,
    checks: 2n,
  });
  const paidState = state({
    ...fundedState,
    mergeConfirmed: true,
    paid: true,
    nextBranchNumber: 5n,
    checks: 3n,
  });
  const refundedState = state({
    ...fundedState,
    refunded: true,
    nextBranchNumber: 5n,
    checks: 3n,
  });

  assert.equal(
    isWorkflowSnapshotProgression(workflow(fundedState), workflow(claimedState)),
    false,
  );
  assert.equal(
    isWorkflowSnapshotProgression(workflow(paidState), workflow(fundedState)),
    false,
  );
  assert.equal(
    isWorkflowSnapshotProgression(workflow(refundedState), workflow(paidState)),
    false,
  );
  assert.equal(
    isWorkflowSnapshotProgression(
      workflow(fundedState),
      workflow({ ...fundedState, githubRepo: "redirected-repo" }),
    ),
    false,
  );
  assert.equal(
    isWorkflowSnapshotProgression(
      workflow(fundedState),
      workflow({ ...fundedState, beneficiary: sponsor }),
    ),
    false,
  );
  assert.equal(
    isWorkflowSnapshotProgression(
      workflow(fundedState),
      workflow({ ...fundedState, checks: 1n }),
    ),
    false,
  );
});
