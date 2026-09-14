import { expect, test, type Page } from "@playwright/test";
import { installWorkflowLifecycleRpcMock } from "./support/rialo-fixture";

test("advances a contributor from approved to funded and paid without a reload", async ({
  page,
}) => {
  const rpc = await installWorkflowLifecycleRpcMock(page);
  const query = new URLSearchParams({
    account: rpc.workflowAddress,
    sponsor: rpc.sponsor,
  });

  await page.goto(`/bounties/${rpc.slug}?${query.toString()}`);
  await expect(
    page.getByRole("heading", { level: 3, name: "Waiting for sponsor funding" }),
  ).toBeVisible();

  rpc.setState("funded");
  await expect(
    page.getByRole("heading", { level: 3, name: "Settlement is running" }),
  ).toBeVisible({ timeout: 10_000 });

  const readsBeforeStaleSnapshot = rpc.getWorkflowReadCount();
  rpc.queueWorkflowRead("approved");
  await expect
    .poll(() => rpc.getWorkflowReadCount(), { timeout: 10_000 })
    .toBeGreaterThan(readsBeforeStaleSnapshot);
  await expect(
    page.getByRole("heading", { level: 3, name: "Settlement is running" }),
  ).toBeVisible();
  await expect(syncStatus(page)).toHaveText("Stale");

  rpc.setState("paid");
  await expect(
    page.getByRole("heading", { level: 3, name: "Bounty paid in full" }),
  ).toBeVisible({ timeout: 12_000 });
  await expect(page.getByRole("link", { name: "View receipt" })).toBeVisible();
  expect(rpc.getWorkflowReadCount()).toBeGreaterThanOrEqual(3);
  await expect.poll(() => navigationCount(page)).toBe(1);
});

test("preserves verified funding through an RPC fault and advances to refund", async ({
  page,
}) => {
  const rpc = await installWorkflowLifecycleRpcMock(page);
  const query = new URLSearchParams({
    account: rpc.workflowAddress,
    sponsor: rpc.sponsor,
  });

  await page.goto(`/bounties/${rpc.slug}?${query.toString()}`);
  await expect(
    page.getByRole("heading", { level: 3, name: "Waiting for sponsor funding" }),
  ).toBeVisible();

  rpc.setState("funded");
  await expect(
    page.getByRole("heading", { level: 3, name: "Settlement is running" }),
  ).toBeVisible({ timeout: 10_000 });

  const readsBeforeFault = rpc.getWorkflowReadCount();
  rpc.failNextWorkflowRead("HTTP 429 from the deterministic Rialo RPC.");
  await expect
    .poll(() => rpc.getWorkflowReadCount(), { timeout: 10_000 })
    .toBeGreaterThan(readsBeforeFault);
  await expect(
    page.getByRole("heading", { level: 3, name: "Settlement is running" }),
  ).toBeVisible();
  await expect(syncStatus(page)).toHaveText("Stale");

  rpc.setState("refunded");
  await expect(
    page.getByRole("heading", { level: 3, name: "Escrow returned in full" }),
  ).toBeVisible({ timeout: 12_000 });
  await expect(syncStatus(page)).toHaveText("Final");

  await page.waitForTimeout(500);
  const terminalReadCount = rpc.getWorkflowReadCount();
  await page.waitForTimeout(3_200);
  expect(rpc.getWorkflowReadCount()).toBe(terminalReadCount);
  await expect.poll(() => navigationCount(page)).toBe(1);
});

function syncStatus(page: Page) {
  return page
    .locator(".readiness-panel li")
    .filter({ hasText: "Sync" })
    .locator("strong");
}

async function navigationCount(page: Page): Promise<number> {
  return page.evaluate(
    () => performance.getEntriesByType("navigation").length,
  );
}
