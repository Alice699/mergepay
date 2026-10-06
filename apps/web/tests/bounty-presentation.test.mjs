import assert from "node:assert/strict";
import test from "node:test";
import { bountyPresentation, formatTimeRemaining } from "../lib/bounty-presentation.ts";

const open = Object.freeze({ paid: false, refunded: false, funded: false, mergeConfirmed: false, claimRequest: false });

test("presents open, approved and funded states without inventing settlement", () => {
  assert.equal(bountyPresentation(open, true, false).label, "Open claim");
  assert.equal(bountyPresentation({ ...open, claimRequest: true }, true, false).label, "Claim requested");
  assert.equal(bountyPresentation(open, false, false).title, "Ready for funding");
  assert.equal(bountyPresentation({ ...open, funded: true }, false, false).title, "Watching for settlement");
  assert.equal(bountyPresentation({ ...open, funded: true, mergeConfirmed: true }, false, false).label, "Merge confirmed");
});

test("a passed deadline never implies a refund, and an unfunded bounty has no escrow", () => {
  assert.equal(bountyPresentation({ ...open, funded: true }, false, true).label, "Refund pending");
  const unfunded = bountyPresentation(open, true, true);
  assert.equal(unfunded.label, "Expired");
  assert.match(unfunded.copy, /no funded bounty reward to refund/);
});

test("terminal onchain outcomes take precedence over the elapsed deadline", () => {
  const paid = bountyPresentation({ ...open, funded: true, mergeConfirmed: true, paid: true }, false, true);
  assert.equal(paid.label, "Paid");
  assert.equal(paid.tone, "success");
  const refunded = bountyPresentation({ ...open, funded: true, refunded: true }, false, true);
  assert.equal(refunded.label, "Refunded");
  assert.equal(refunded.tone, "warning");
});

test("remaining time counts down in days, hours, minutes and seconds", () => {
  const now = 1_900_000_000_000;
  for (const [remaining, label] of [[90_000_000, "1d 1h left"], [3_660_000, "1h 1m left"], [61_000, "1m 1s left"], [1_001, "2s left"], [1, "1s left"], [0, "Deadline reached"], [-1, "Deadline reached"]]) {
    assert.equal(formatTimeRemaining(BigInt(now + remaining), now), label);
  }
});

test("the display can re-read the same absolute deadline without resetting it", () => {
  const deadline = 1_900_000_000_000n;
  assert.equal(formatTimeRemaining(deadline, Number(deadline) - 30_000), "30s left");
  assert.equal(formatTimeRemaining(deadline, Number(deadline) - 20_000), "20s left");
  assert.equal(formatTimeRemaining(deadline, Number(deadline) + 1_000), "Deadline reached");
});
