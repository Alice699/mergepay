import { expect, test, type Locator, type Page } from "@playwright/test";
import { connectMockWallet, installMockWallet, installRialoRpcMock } from "./support/rialo-fixture";

const emptyPages = [
  ["/bounties", "No open bounties found", "Create a bounty"],
  ["/activity", "Connect a wallet to see activity", "Open wallet"],
  ["/settlements", "Connect a wallet to see settlements", "Open wallet"],
  ["/diagnostics", "No live workflows yet", "Create a bounty"],
] as const;

for (const [path, title, action] of emptyPages) {
  test(`${path} has a consistent, actionable empty view on desktop and phones`, async ({ page }, testInfo) => {
    await installRialoRpcMock(page, "empty");
    await page.goto(path);
    const empty = page.locator('.empty-state[data-layout="page"]');
    await expect(empty.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(empty).toHaveAttribute("data-tone", "default");
    await page.evaluate(() => document.fonts.ready);

    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await expectNoOverflow(page, empty);
      await expect(empty.getByRole(action === "Open wallet" ? "button" : "link", { name: action, exact: true })).toBeVisible();
      await empty.screenshot({ path: testInfo.outputPath(`${path.slice(1)}-empty-${width}.png`) });
      if (width === 1440 || width === 390) {
        await resetScreenshotScroll(page);
        await page.screenshot({ path: testInfo.outputPath(`${path.slice(1)}-page-${width}.png`), fullPage: true });
      }
    }

    if (action === "Open wallet") {
      await empty.getByRole("button", { name: action, exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Rialo wallet" })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    } else {
      await expect(empty.getByRole("link", { name: action, exact: true })).toHaveAttribute("href", "/bounties/new");
    }
  });
}

for (const [path, title, link, href] of [
  ["/activity", "No activity for this wallet yet", "Create a bounty", "/bounties/new"],
  ["/settlements", "Nothing paid or refunded yet", "View all activity", "/activity"],
] as const) {
  test(`${path} distinguishes a connected wallet with no records from a disconnected wallet`, async ({ page }, testInfo) => {
    await installMockWallet(page);
    await installRialoRpcMock(page, "empty");
    await page.goto(path);
    await connectMockWallet(page);
    const empty = page.locator('.empty-state[data-layout="page"]');
    await expect(empty.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(empty).toHaveAttribute("data-tone", "default");
    await expect(empty.getByRole("link", { name: link, exact: true })).toHaveAttribute("href", href);
    await expect(empty.getByRole("button", { name: "Open wallet", exact: true })).toHaveCount(0);

    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await expectNoOverflow(page, empty);
      await empty.screenshot({ path: testInfo.outputPath(`${path.slice(1)}-connected-empty-${width}.png`) });
      if (width === 1440 || width === 390) {
        await resetScreenshotScroll(page);
        await page.screenshot({ path: testInfo.outputPath(`${path.slice(1)}-connected-page-${width}.png`), fullPage: true });
      }
    }
  });
}

for (const [path, title, needsWallet, recoveredTitle] of [
  ["/bounties", "Bounty discovery could not be read.", false, "No open bounties found"],
  ["/activity", "Activity could not be read", true, "No activity for this wallet yet"],
  ["/settlements", "Settlement history could not be read", true, "Nothing paid or refunded yet"],
  ["/diagnostics", "Diagnostics could not be read", false, "No live workflows yet"],
] as const) {
  test(`${path} keeps an interrupted read distinct from an empty history and supports retry`, async ({ page }, testInfo) => {
    if (needsWallet) await installMockWallet(page);
    const rpc = await installRialoRpcMock(page, "empty");
    rpc.failNextSignatureRead();
    await page.goto(path);
    if (needsWallet) await connectMockWallet(page);
    const empty = page.locator('.empty-state[data-layout="page"]');
    await expect(empty.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(empty).toHaveAttribute("data-tone", "error");
    await expect(empty.getByRole("heading", { name: recoveredTitle, exact: true })).toHaveCount(0);
    await page.setViewportSize({ width: 320, height: 1000 });
    await expectNoOverflow(page, empty);
    await empty.screenshot({ path: testInfo.outputPath(`${path.slice(1)}-read-error-320.png`) });
    await empty.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(empty.getByRole("heading", { name: recoveredTitle, exact: true })).toBeVisible();
    await expect(empty).toHaveAttribute("data-tone", "default");
  });
}

test("filtered bounty discovery offers a clear reset without changing its default scope", async ({ page }) => {
  await installRialoRpcMock(page, "empty");
  await page.goto("/bounties");
  const empty = page.locator('.empty-state[data-layout="page"]');
  await expect(empty.getByRole("heading", { name: "No open bounties found" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search repository or pull request" }).fill("unmatched-repository");
  await expect(empty.getByRole("heading", { name: "No bounties match these filters" })).toBeVisible();
  await empty.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "Search repository or pull request" })).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Filter by bounty status" })).toHaveValue("open");
  await expect(page.getByRole("combobox", { name: "Filter by bounty scope" })).toHaveValue("all");
  await expect(empty.getByRole("heading", { name: "No open bounties found" })).toBeVisible();
});

test("workflow lookup stays available on demand, keyboard-accessible, and validates the exact ID", async ({ page }, testInfo) => {
  await installRialoRpcMock(page, "empty");
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto("/bounties");
  const empty = page.locator('.empty-state[data-layout="page"]');
  const lookup = empty.locator(".empty-state__lookup");
  await expect(lookup).not.toHaveAttribute("open", "");
  await lookup.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(lookup).toHaveAttribute("open", "");
  const input = lookup.getByRole("textbox", { name: "Workflow ID lookup" });
  await input.fill("abcd");
  await lookup.getByRole("button", { name: "Inspect record" }).click();
  await expect(lookup.getByRole("alert")).toContainText("exact 64-character hexadecimal workflow ID");
  await expectNoOverflow(page, empty);
  await empty.screenshot({ path: testInfo.outputPath("bounties-lookup-expanded-320.png") });
  await input.fill("f".repeat(64));
  await expect(lookup.getByRole("alert")).toHaveCount(0);
  await lookup.getByRole("button", { name: "Inspect record" }).click();
  await expect(page).toHaveURL(new RegExp(`/bounties/${"f".repeat(64)}$`));
});

test("the wallet’s compact empty history returns to its balance without navigating the dapp", async ({ page }, testInfo) => {
  const methods: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/rialo")) methods.push((request.postDataJSON() as { method: string }).method);
  });
  await installMockWallet(page);
  await installRialoRpcMock(page, "empty");
  await page.goto("/bounties/new");
  await connectMockWallet(page);
  await page.locator(".wallet-button").click();
  const dialog = page.getByRole("dialog", { name: "Rialo wallet" });
  await dialog.getByRole("button", { name: "Activity", exact: true }).click();
  const empty = dialog.locator('.empty-state[data-layout="compact"]');
  await expect(empty.getByRole("heading", { name: "No transactions yet" })).toBeVisible();
  await expect(empty).toHaveAttribute("data-tone", "default");
  await page.setViewportSize({ width: 320, height: 1000 });
  await expectNoOverflow(page, empty);
  await dialog.screenshot({ path: testInfo.outputPath("wallet-history-empty-320.png") });
  await empty.getByRole("button", { name: "Back to balance", exact: true }).click();
  await expect(dialog.locator(".wallet-portfolio")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Activity", exact: true })).toBeFocused();
  await expect(page).toHaveURL(/\/bounties\/new$/);
  expect(methods).not.toContain("sendTransaction");
  expect(methods).not.toContain("requestAirdrop");
});

async function expectNoOverflow(page: Page, empty: Locator) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    `Page overflow at ${page.viewportSize()?.width}px`,
  ).toBeLessThanOrEqual(1);
  expect(await empty.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  const layout = await empty.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const icon = element.querySelector(".empty-state__icon")!.getBoundingClientRect();
    const title = element.querySelector(".empty-state__title")!.getBoundingClientRect();
    const center = bounds.left + bounds.width / 2;
    return {
      iconOffset: Math.abs(icon.left + icon.width / 2 - center),
      titleOffset: Math.abs(title.left + title.width / 2 - center),
      iconBottom: icon.bottom,
      titleTop: title.top,
      actionHeights: [...element.querySelectorAll(".empty-state__actions :is(a, button)")]
        .map((action) => action.getBoundingClientRect().height),
    };
  });
  expect(layout.iconOffset, "The icon should align with the content center").toBeLessThanOrEqual(1);
  expect(layout.titleOffset, "The heading should align with the content center").toBeLessThanOrEqual(1);
  expect(layout.iconBottom, "The icon should sit above the heading").toBeLessThanOrEqual(layout.titleTop);
  for (const height of layout.actionHeights) expect(height, "Actions need a comfortable touch target").toBeGreaterThanOrEqual(40);
}

async function resetScreenshotScroll(page: Page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
}
