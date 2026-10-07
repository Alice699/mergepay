import { expect, test, type Page } from "@playwright/test";
import {
  installRialoRpcMock,
  installWorkflowLifecycleRpcMock,
} from "./support/rialo-fixture";

const signature = "E2EReceipt".padEnd(88, "a");
const beneficiary = "5wk6cLsYjhYSpr7brqtJ7xnvzbh1zvUpoSxeivbjyEkd";

for (const outcome of ["paid", "refunded"] as const) {
  test(`${outcome} receipt makes the exact amount, destination and transaction prominent and keeps all audit evidence accessible`, async ({ page }, testInfo) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const rpc = await installWorkflowLifecycleRpcMock(page, { initialState: outcome, withPolicy: true });
    await page.goto(receiptHref(rpc));
    const receipt = page.locator(".settlement-receipt");
    await expect(receipt).toHaveAttribute("data-outcome", outcome);
    await expect(receipt.getByRole("heading", { name: outcome === "paid" ? "Bounty paid." : "Escrow refunded.", exact: true })).toBeVisible();
    await expect(receipt.locator(".settlement-receipt__amount strong")).toHaveText("1 RLO");
    await expect(receipt.locator(".settlement-receipt__terminal-proof")).toContainText(`${outcome} = true`);
    const destination = receipt.locator(".settlement-receipt__destination");
    const address = outcome === "paid" ? beneficiary : rpc.sponsor;
    await expect(destination.locator(".copy-value")).toHaveAttribute("title", address);
    await expect(destination).toContainText(outcome === "paid" ? "Approved contributor" : "Workflow sponsor");
    await destination.locator(".copy-value").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(address);
    await expect(receipt.getByRole("link", { name: /^Pull request #7/ })).toHaveAttribute("href", "https://github.com/Alice699/mergepay-live-lifecycle/pull/7");
    const scan = receipt.getByRole("link", { name: "Open transaction in Rialo Scan" });
    expect(new URL((await scan.getAttribute("href"))!).searchParams.get("search")).toBe(signature);
    await expect(receipt.locator(".settlement-receipt__detail--proof .copy-value")).toHaveAttribute("title", signature);
    const audit = receipt.locator(".settlement-receipt__audit");
    await expect(audit).not.toHaveAttribute("open", "");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expectNoHorizontalOverflow(page);
    expect((await receipt.boundingBox())!.height).toBeLessThan(900);
    await page.screenshot({ path: testInfo.outputPath(`receipt-${outcome}-1440.png`), fullPage: true });

    await audit.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(audit).toHaveAttribute("open", "");
    await expect(audit).toContainText("Remaining account balance");
    await expect(audit).toContainText("0.0025 RLO remains");
    await expect(audit).toContainText("CI required · Minimum 1 approval");
    await expect(audit).toContainText("Target branch: main");
    await expect(audit.locator('.copy-value[title="' + "a".repeat(40) + '"]')).toBeVisible();
    await expect(audit).toContainText(outcome === "paid" ? "All locked conditions passed" : "Pull request not merged");
    await expect(audit).toContainText("Last REX evidence");
    await expect(audit).toContainText(`paid = ${outcome === "paid"} · refunded = ${outcome === "refunded"}`);
    await expect(audit.getByText("Verified merge commit", { exact: true })).toHaveCount(outcome === "paid" ? 1 : 0);
    await page.screenshot({ path: testInfo.outputPath(`receipt-${outcome}-expanded-1440.png`), fullPage: true });
    for (const width of [1280, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoHorizontalOverflow(page);
      await expect(receipt.locator(".settlement-receipt__amount strong")).toHaveText("1 RLO");
      await page.screenshot({ path: testInfo.outputPath(`receipt-${outcome}-expanded-${width}.png`), fullPage: true });
    }
    await audit.locator("summary").click();
    await expect(audit).not.toHaveAttribute("open", "");
    await expect(receipt.getByRole("link", { name: "View workflow", exact: true })).toHaveAttribute("href", new RegExp(`account=${rpc.workflowAddress}`));
    await expect(page.getByRole("link", { name: "Back to settlements", exact: true })).toHaveAttribute("href", "/settlements");
    await expect(receipt.getByRole("link", { name: "Activity ledger", exact: true })).toHaveAttribute("href", "/activity");
  });
}

test("a missing transaction hint never invents a transaction link", async ({ page }) => {
  const rpc = await installWorkflowLifecycleRpcMock(page, { initialState: "paid", withPolicy: true });
  await page.goto(receiptHref(rpc, false));
  await expect(page.locator(".settlement-receipt")).toHaveAttribute("data-outcome", "paid");
  await expect(page.getByText("Transaction link not provided", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open transaction in Rialo Scan" })).toHaveCount(0);
});

test("legacy receipts do not claim revision, CI or review evidence that was not recorded", async ({ page }) => {
  const rpc = await installWorkflowLifecycleRpcMock(page, { initialState: "paid" });
  await page.goto(receiptHref(rpc));
  const receipt = page.locator(".settlement-receipt");
  await expect(receipt).toHaveAttribute("data-outcome", "paid");
  await expect(receipt).toContainText("Verified merge payout");
  await receipt.locator(".settlement-receipt__audit summary").click();
  await expect(receipt.getByText("Locked GitHub revision", { exact: true })).toHaveCount(0);
  await expect(receipt.getByText("Locked payout policy", { exact: true })).toHaveCount(0);
  await expect(receipt).not.toContainText("proof_status = 6");
});

test("a pending receipt stays non-final and updates to paid from onchain reads", async ({ page }, testInfo) => {
  const rpc = await installWorkflowLifecycleRpcMock(page, { initialState: "funded", withPolicy: true });
  await page.goto(receiptHref(rpc));
  await expect(page.getByRole("heading", { name: "Settlement is still running." })).toBeVisible();
  await expect(page.locator('.settlement-receipt[data-outcome]')).toHaveCount(0);
  await expect(page.locator(".settlement-receipt__verified")).toContainText("Heartbeat active");
  await page.setViewportSize({ width: 320, height: 900 });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("receipt-pending-320.png"), fullPage: true });
  rpc.setState("paid");
  await expect(page.locator(".settlement-receipt")).toHaveAttribute("data-outcome", "paid");
  await expect(page.getByRole("heading", { name: "Bounty paid.", exact: true })).toBeVisible();
  await expect(page.locator(".settlement-receipt__terminal-proof")).toContainText("paid = true");
  expect(rpc.getWorkflowReadCount()).toBeGreaterThan(1);
});

test("a mismatched workflow account never renders a verified receipt", async ({ page }) => {
  const rpc = await installWorkflowLifecycleRpcMock(page, { initialState: "paid", withPolicy: true });
  await page.goto(receiptHref({ ...rpc, slug: "e".repeat(64) }));
  await expect(page.getByRole("heading", { name: "This receipt cannot be trusted." })).toBeVisible();
  await expect(page.locator(".settlement-receipt")).toHaveCount(0);
  await expect(page.getByText("Onchain verified", { exact: true })).toHaveCount(0);
});

test("an interrupted receipt read is explicit and retry remains available", async ({ page }) => {
  const rpc = await installWorkflowLifecycleRpcMock(page, { initialState: "refunded", withPolicy: true });
  rpc.failNextWorkflowRead();
  await page.goto(receiptHref(rpc));
  await expect(page.getByRole("heading", { name: "Receipt data is unavailable." })).toBeVisible();
  await expect(page.getByText("Onchain verified", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Retry verification", exact: true }).click();
  await expect(page.locator(".settlement-receipt")).toHaveAttribute("data-outcome", "refunded");
});

for (const [path, title] of [
  ["/settlements/receipt", "This receipt cannot be verified."],
  [`/settlements/${"f".repeat(64)}`, "Choose the account to verify."],
] as const) {
  test(`missing receipt context remains honest and readable: ${title}`, async ({ page }) => {
    await installRialoRpcMock(page, "empty");
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(path);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(page.getByText("Onchain verified", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Proof ready", { exact: true })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
}

for (const [timezoneId, label] of [["UTC", "UTC"], ["Asia/Jakarta", "WIB"], ["Asia/Makassar", "WITA"], ["Asia/Jayapura", "WIT"]] as const) {
  test.describe(`receipt timestamps in ${label}`, () => {
    test.use({ timezoneId });
    test("shows local time for the deadline and the REX observation", async ({ page }) => {
      const rpc = await installWorkflowLifecycleRpcMock(page, { initialState: "paid", withPolicy: true });
      await page.goto(receiptHref(rpc));
      const details = page.locator(".settlement-receipt__record .settlement-receipt__details > div");
      await expect(details.filter({ has: page.getByText("Deadline", { exact: true }) })).toContainText(label);
      await page.locator(".settlement-receipt__audit summary").click();
      const evidence = page.locator(".settlement-receipt__audit-grid > div").filter({ has: page.getByText("Last REX evidence", { exact: true }) });
      await expect(evidence).toContainText(label);
    });
  });
}

function receiptHref(rpc: { slug: string; sponsor: string; workflowAddress: string }, withTransaction = true) {
  const query = new URLSearchParams({ account: rpc.workflowAddress, sponsor: rpc.sponsor });
  if (withTransaction) query.set("tx", signature);
  return `/settlements/${rpc.slug}?${query}`;
}

async function expectNoHorizontalOverflow(page: Page) {
  const layout = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return {
      overflow: document.documentElement.scrollWidth - width,
      outsideViewport: Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .map((element) => ({ element: element.className, right: element.getBoundingClientRect().right }))
        .filter((element) => typeof element.element === "string" && element.right > width + 1)
        .slice(0, 12),
    };
  });
  expect(
    layout.overflow,
    `Page overflow at viewport width ${page.viewportSize()?.width}: ${JSON.stringify(layout.outsideViewport)}`,
  ).toBeLessThanOrEqual(1);
  const receipt = page.locator(".settlement-receipt");
  if (await receipt.count()) {
    expect(await receipt.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  }
}
