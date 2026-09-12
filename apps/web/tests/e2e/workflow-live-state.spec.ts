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

  rpc.setState("paid");
  await expect(
    page.getByRole("heading", { level: 3, name: "Bounty paid in full" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("link", { name: "View receipt" })).toBeVisible();
  expect(rpc.getWorkflowReadCount()).toBeGreaterThanOrEqual(3);
  await expect.poll(() => navigationCount(page)).toBe(1);
});

async function navigationCount(page: Page): Promise<number> {
  return page.evaluate(
    () => performance.getEntriesByType("navigation").length,
  );
}
