import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const webRoot = new URL("../", import.meta.url);
const programUrl = new URL(
  "../../programs/mergepay-rialo/src/lib.rs",
  webRoot,
);
const [guide, docs, program] = await Promise.all([
  readFile(new URL("app/guide/page.tsx", webRoot), "utf8"),
  readFile(new URL("app/docs/page.tsx", webRoot), "utf8"),
  readFile(programUrl, "utf8"),
]);

test("guide explains revision verification and optional payout policy", () => {
  assert.match(guide, /Verify target/);
  assert.match(guide, /head SHA and target branch/);
  assert.match(guide, /Require successful CI/);
  assert.match(guide, /Required approvals/);
  assert.match(guide, /Use different sponsor and contributor wallets/);
  assert.match(guide, /short-lived, one-time authorization/);
});

test("both pages require proof processing before the absolute deadline", () => {
  for (const page of [guide, docs]) {
    assert.match(page, /absolute time/);
    assert.match(page, /funding does not restart/);
    assert.match(page, /local time zone/);
    assert.match(page, /before the deadline/);
    assert.match(page, /callback (?:arrives after|at or after)/);
  }

  const callback = program.slice(
    program.indexOf("handler fn handle_merge_response("),
    program.indexOf("fn execute_refund("),
  );
  assert.match(callback, /current_unix_ms as u64 >= self\.deadline_unix_ms/);
  assert.match(callback, /proof_head_sha != self\.expected_head_sha/);
  assert.match(callback, /proof_base_ref != self\.expected_base_ref/);
  assert.match(callback, /self\.require_ci_success && !proof_ci_success/);
  assert.match(callback, /proof_approvals < self\.minimum_approvals/);
  assert.doesNotMatch(guide, /a merged pull request pays|unanimous merged proof pays/);
  assert.doesNotMatch(docs, /A unanimous merged proof pays/);
});

test("protocol flow lists real program entry points, not application aliases", () => {
  const commandBlocks = [...docs.matchAll(
    /<div className="protocol-flow__commands mono">([\s\S]*?)<\/div>/g,
  )];
  const commands = commandBlocks.flatMap(([, block]) =>
    [...block.matchAll(/<code>(\w+)<\/code>/g)].map(([, name]) => name),
  );
  assert.deepEqual(commands, [
    "create_bounty",
    "request_claim",
    "accept_claim",
    "prepare_funding",
    "fund",
    "run_merge_check",
    "handle_merge_response",
  ]);
  for (const command of commands) {
    assert.match(program, new RegExp(`(?:initiating|control|handler) fn ${command}\\(`));
  }
  assert.match(docs, /GitHub OAuth and Verify PR are offchain application steps/);
  assert.doesNotMatch(docs, /<code>verify_identity<\/code>|<code>native_heartbeat<\/code>/);
  assert.match(docs, /one atomic funding transaction/);
});

test("REX documentation scopes agreement to the received report and exact policy", () => {
  for (const page of [guide, docs]) {
    assert.match(page, /all outputs in the received REX report/);
    assert.doesNotMatch(page, /Every validator agrees/);
  }
  assert.match(program, /for update in &report\.updates/);
  assert.match(program, /success_count != output_count \|\| !payloads_match/);
  assert.match(docs, /success, neutral, or skipped conclusion/);
  assert.match(program, /Some\("success" \| "neutral" \| "skipped"\)/);
  assert.match(docs, /latest decisive review per numeric reviewer ID/);
  assert.match(docs, /OWNER, MEMBER, or COLLABORATOR/);
  assert.match(program, /"OWNER" \| "MEMBER" \| "COLLABORATOR"/);
});

test("manual fallbacks are not documented as universally idempotent", () => {
  assert.doesNotMatch(guide, /controls remain idempotent fallbacks/);
  assert.match(docs, /It is rejected after the deadline or a terminal outcome/);
  assert.match(docs, /already-refunded workflow returns without another transfer/);
  assert.match(docs, /Paid and refunded are mutually exclusive/);

  const manualCheck = program.slice(
    program.indexOf("control fn check_merge("),
    program.indexOf("handler fn run_merge_check("),
  );
  assert.match(manualCheck, /self\.paid[\s\S]*self\.refunded/);
  assert.match(manualCheck, /current_unix_ms as u64 >= self\.deadline_unix_ms/);
  assert.match(manualCheck, /return Err\(ProgramError::InvalidArgument\)/);

  const refund = program.slice(
    program.indexOf("fn execute_refund("),
    program.indexOf("control fn status("),
  );
  assert.match(refund, /if self\.refunded \{[\s\S]*?return Ok\(\(\)\)/);
});

test("display failures are separate from native execution", () => {
  assert.match(guide, /do not themselves lock funds or stop native execution/);
  assert.match(docs, /browser visibility affects display updates, not native execution/);
  assert.match(docs, /a slow RPC or decoder error does not stop native settlement/);
  assert.doesNotMatch(guide, /program and UI keep uncertain funds locked/);
});
