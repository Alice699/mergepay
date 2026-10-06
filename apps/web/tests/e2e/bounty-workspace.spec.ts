import { expect, test, type Page } from "@playwright/test";
import {
  connectMockWallet,
  installMockWallet,
  installRialoRpcMock,
  installWorkflowLifecycleRpcMock,
} from "./support/rialo-fixture";

const preview = {
  owner: "Alice699",
  repo: "mergepay-demo",
  number: 7,
  title: "Document the contributor payout fixture",
  state: "open",
  htmlUrl: "https://github.com/Alice699/mergepay-demo/pull/7",
  headSha: "a".repeat(40),
  baseRef: "main",
  author: { id: 136351960, login: "biawaklahat", avatarUrl: null },
};

test("keeps the next action above proof and makes technical evidence keyboard-accessible", async ({ page }) => {
  const rpc = await installWorkflowLifecycleRpcMock(page, { initialState: "funded", withPolicy: true });
  await openBounty(page, rpc);
  await expect(page.getByRole("heading", { level: 2, name: "Watching for settlement" })).toBeVisible();
  await expect(page.locator(".bounty-status")).toHaveText("Funded");
  await expect(page.locator(".bounty-overview__amount")).toHaveText("1 RLO");
  await expect(page.locator(".bounty-countdown")).toContainText("left");
  await expect(page.getByRole("heading", { name: "Settlement is running" })).toBeVisible();
  expect(await page.locator(".bounty-next-action").evaluate((element) => Boolean(element.compareDocumentPosition(document.querySelector(".workflow-proof")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);

  const proof = page.locator(".bounty-proof-details");
  await expect(proof).not.toHaveAttribute("open");
  await proof.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(proof).toHaveAttribute("open", "");
  await expect(page.locator(".workflow-proof__policy")).toContainText("Required");
  await expect(page.locator(".workflow-proof__evidence")).toContainText("Not observed");
  await expect(page.locator(".workflow-proof__evidence")).toContainText("UTC");
  await page.keyboard.press("Enter");
  await expect(proof).not.toHaveAttribute("open");

  await page.locator(".bounty-account-details summary").click();
  await expect(page.locator(".bounty-account-details").getByRole("button", { name: `Copy ${rpc.slug}`, exact: true })).toBeVisible();
});

test("updates the sponsor action from funding to checking without resetting the deadline", async ({ page }) => {
  await installMockWallet(page);
  const rpc = await installWorkflowLifecycleRpcMock(page, { withPolicy: true });
  await openBounty(page, rpc);
  await connectMockWallet(page);
  await expect(page.getByRole("heading", { level: 2, name: "Ready for funding" })).toBeVisible();
  await expect(page.locator(".workflow-fund .button")).toBeEnabled();
  const deadline = await page.locator(".bounty-overview > div").nth(1).locator("dd > span:last-child").innerText();
  rpc.setState("funded");
  await expect(page.getByRole("heading", { name: "Autonomous settlement" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Run check now" })).toBeEnabled();
  await expect(page.locator(".bounty-overview > div").nth(1).locator("dd > span:last-child")).toHaveText(deadline);
  expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(1);
});

test("an expired funded workflow stays refund-pending until Rialo verifies the refund", async ({ page }) => {
  const rpc = await installWorkflowLifecycleRpcMock(page, { initialState: "funded", deadlineUnixMs: BigInt(Date.now() - 60_000), withPolicy: true });
  await openBounty(page, rpc);
  await expect(page.locator(".bounty-status")).toHaveText("Refund pending");
  await expect(page.locator(".bounty-countdown")).toHaveText("Deadline reached");
  await expect(page.getByRole("link", { name: "View receipt" })).toHaveCount(0);
  rpc.setState("refunded");
  await expect(page.getByRole("heading", { level: 2, name: "Escrow refunded" })).toBeVisible({ timeout: 12_000 });
  await expect(page.getByRole("link", { name: "View receipt" })).toBeVisible();
  await expect(page.locator(".bounty-countdown")).toHaveCount(0);
  await expect(page.locator(".bounty-overview")).toContainText("Returned to sponsor");
  await expect(page.locator(".bounty-account-details")).not.toHaveAttribute("open");
});

for (const state of ["paid", "refunded"] as const) {
  test(`${state} has a visible receipt and a distinct final status`, async ({ page }) => {
    const rpc = await installWorkflowLifecycleRpcMock(page, { initialState: state, withPolicy: true });
    await openBounty(page, rpc);
    await expect(page.locator(".bounty-status")).toHaveText(state === "paid" ? "Paid" : "Refunded");
    await expect(page.locator(".bounty-status")).toHaveAttribute("data-tone", state === "paid" ? "success" : "warning");
    await expect(page.getByRole("link", { name: "View receipt" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View receipt" })).toHaveAttribute("href", new RegExp(`account=${rpc.workflowAddress}`));
    await expect(page.locator(".bounty-countdown")).toHaveCount(0);
    await expect(page.locator(".bounty-account-details")).not.toHaveAttribute("open");
  });
}

test("Create Bounty reviews the exact terms and invalidates a changed GitHub target", async ({ page }) => {
  await prepareCreatePage(page);
  await fillBounty(page);
  const review = page.locator(".bounty-review__summary");
  await expect(review).toContainText("2.123456789 RLO");
  await page.getByRole("checkbox", { name: /Require successful CI/ }).check();
  await page.getByLabel("Required approvals").selectOption("2");
  await expect(review).toContainText("Successful CI required · 2 approvals required");
  await expect(page.getByRole("button", { name: "Create bounty", exact: true })).toBeEnabled();
  expect(await page.locator("form.bounty-form").evaluate((element) => Object.fromEntries(new FormData(element as HTMLFormElement)))).toMatchObject({ amountRlo: "2.123456789", deadlineUnixMs: "2032-10-07T12:30", requireCiSuccess: "on", minimumApprovals: "2" });
  await page.locator('input[name="pullNumber"]').fill("8");
  await expect(review).toContainText("Verify the GitHub target first");
  await expect(page.getByRole("button", { name: "Verify target first", exact: true })).toBeDisabled();

  await page.locator(".bounty-workflow-id summary").click();
  const previousId = await page.locator("#workflow-id").inputValue();
  await page.getByRole("button", { name: "Generate a new workflow ID" }).click();
  expect(await page.locator("#workflow-id").inputValue()).not.toBe(previousId);
  await expect(review).toContainText("2.123456789 RLO");
});

test("an expired creation deadline is rejected before signing", async ({ page }) => {
  await prepareCreatePage(page);
  await fillBounty(page);
  await page.locator('input[name="deadlineUnixMs"]').fill("2020-01-01T12:30");
  await page.getByRole("button", { name: "Create bounty", exact: true }).click();
  await expect(page.locator(".form-submit__status")).toContainText("Choose a future deadline.");
  await expect(page.getByRole("dialog", { name: /Review/ })).toHaveCount(0);
});

for (const zone of [{ id: "UTC", label: "UTC" }, { id: "Asia/Jakarta", label: "WIB" }, { id: "Asia/Makassar", label: "WITA" }, { id: "Asia/Jayapura", label: "WIT" }]) {
  test.describe(`bounty time in ${zone.label}`, () => {
    test.use({ timezoneId: zone.id });
    test("labels the selected deadline in both the form and review", async ({ page }) => {
      await prepareCreatePage(page);
      await fillBounty(page);
      await expect(page.locator("#deadline-hint")).toContainText(zone.label);
      await expect(page.locator(".bounty-review__summary")).toContainText(`12:30 ${zone.label}`);
    });
  });
}

for (const screen of ["detail", "create"] as const) {
  test(`${screen} is readable without overflow on desktop, tablet and phones`, async ({ page }, testInfo) => {
    if (screen === "detail") {
      await installMockWallet(page);
      const rpc = await installWorkflowLifecycleRpcMock(page, { initialState: "funded", withPolicy: true });
      await openBounty(page, rpc);
      await connectMockWallet(page);
      await expect(page.getByRole("button", { name: "Run check now" })).toBeVisible();
    } else {
      await prepareCreatePage(page);
      await fillBounty(page);
      await page.getByRole("checkbox", { name: /Require successful CI/ }).check();
    }
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.locator("h1").click();
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.screenshot({ path: testInfo.outputPath(`${screen}-${width}.png`), fullPage: width >= 768 });
      const disclosures = page.locator("main details");
      for (let index = 0; index < await disclosures.count(); index += 1) {
        const disclosure = disclosures.nth(index);
        await disclosure.locator(":scope > summary").click();
        await expect(disclosure).toHaveAttribute("open", "");
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await disclosure.locator(":scope > summary").click();
      }
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    }
  });
}

async function openBounty(page: Page, rpc: { slug: string; sponsor: string; workflowAddress: string }) {
  await page.goto(`/bounties/${rpc.slug}?${new URLSearchParams({ account: rpc.workflowAddress, sponsor: rpc.sponsor })}`);
  await expectBountyStyles(page);
}

async function prepareCreatePage(page: Page) {
  await installMockWallet(page);
  await installRialoRpcMock(page, "empty");
  await page.route("**/api/github/settlement-preview?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(preview) }));
  await page.goto("/bounties/new");
  await expectBountyStyles(page);
  await connectMockWallet(page);
}

async function expectBountyStyles(page: Page) {
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  await expect.poll(() => page.locator("main").evaluate((element) => getComputedStyle(element).getPropertyValue("--bounty-muted").trim())).toBe("#a7adb3");
}

async function fillBounty(page: Page) {
  await page.locator('input[name="githubOwner"]').fill(preview.owner);
  await page.locator('input[name="githubRepo"]').fill(preview.repo);
  await page.locator('input[name="pullNumber"]').fill(String(preview.number));
  await page.getByRole("button", { name: "Verify target", exact: true }).click();
  await expect(page.getByText(preview.title, { exact: true }).first()).toBeVisible();
  await page.locator('input[name="amountRlo"]').fill("2.123456789");
  await page.locator('input[name="deadlineUnixMs"]').fill("2032-10-07T12:30");
}
