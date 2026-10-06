import assert from "node:assert/strict";
import test from "node:test";
import { groupWalletActivity } from "../lib/activity-groups.ts";

function transaction(signature, overrides = {}) {
  return Object.freeze({
    signature,
    blockHeight: 100n,
    blockTime: 1_787_941_100n,
    status: "confirmed",
    error: null,
    action: "check_merge",
    workflowAddress: "workflow-a",
    relatedWorkflowAddress: null,
    workflowSlug: null,
    workflowPayer: null,
    legacyInstruction: false,
    feeKelvin: 100n,
    rexSignal: null,
    ...overrides,
  });
}

function flatten(entries) {
  return entries.flatMap((entry) => entry.kind === "transaction" ? [entry.item] : entry.items);
}

test("groups adjacent confirmed checks without changing records or order", () => {
  const items = Object.freeze([transaction("newest"), transaction("middle"), transaction("oldest")]);
  const entries = groupWalletActivity(items);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, "merge-checks");
  assert.deepEqual(entries[0].items, items);
  flatten(entries).forEach((item, index) => assert.equal(item, items[index]));
});

test("never folds failures, different workflows, or intervening actions into a check group", () => {
  const items = [
    transaction("a1"), transaction("a2"),
    transaction("failed", { status: "failed", error: "Rejected" }),
    transaction("a3"),
    transaction("fund", { action: "fund" }),
    transaction("b1", { workflowAddress: "workflow-b" }),
    transaction("b2", { workflowAddress: "workflow-b" }),
    transaction("a4"),
  ];
  const entries = groupWalletActivity(items);
  assert.deepEqual(entries.map((entry) => entry.kind), [
    "merge-checks", "transaction", "transaction", "transaction", "merge-checks", "transaction",
  ]);
  assert.deepEqual(flatten(entries), items);
  assert.equal(entries[1].item.signature, "failed");
});

test("keeps single checks and unknown workflow records individually inspectable", () => {
  assert.deepEqual(groupWalletActivity([]), []);
  const items = [transaction("single"), transaction("unknown1", { workflowAddress: null }), transaction("unknown2", { workflowAddress: null })];
  assert.equal(groupWalletActivity(items).every((entry) => entry.kind === "transaction"), true);
});

test("an inconclusive proof remains visible even when its transaction is confirmed", () => {
  const items = [transaction("a1"), transaction("unclear", { rexSignal: "inconclusive" }), transaction("a2"), transaction("a3")];
  const entries = groupWalletActivity(items);
  assert.deepEqual(entries.map((entry) => entry.kind), ["transaction", "transaction", "merge-checks"]);
  assert.equal(entries[1].item.signature, "unclear");
  assert.deepEqual(flatten(entries), items);
});

test("grouping stays local to the loaded page and does not retain previous records", () => {
  const first = [transaction("first1"), transaction("first2")];
  const second = [transaction("next1"), transaction("next2")];
  assert.deepEqual(flatten(groupWalletActivity(first)), first);
  assert.deepEqual(flatten(groupWalletActivity(second)), second);
});
