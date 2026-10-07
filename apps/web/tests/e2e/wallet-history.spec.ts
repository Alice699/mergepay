import { expect, test, type Page } from "@playwright/test";
import {
  connectMockWallet,
  installMockWallet,
  installRialoRpcMock,
  MOCK_WALLET_ADDRESS,
} from "./support/rialo-fixture";

test("Activity stays in the wallet, reads the active address and paginates without losing the bounty draft", async ({ page }) => {
  const historyAddresses: unknown[] = [];
  const methods: string[] = [];
  page.on("request", (request) => {
    if (!request.url().endsWith("/api/rialo")) return;
    const payload = request.postDataJSON() as { method: string; params?: Array<{ address?: string }> };
    methods.push(payload.method);
    if (payload.method === "getSignaturesForAddress") historyAddresses.push(payload.params?.[0]?.address);
  });
  const { dialog } = await prepareWallet(page, "activity");
  await page.getByRole("textbox", { name: "Owner", exact: false }).fill("Alice699");
  await dialog.getByRole("button", { name: "Activity", exact: true }).click();
  const rows = dialog.locator(".wallet-history__row");
  const pagination = dialog.getByRole("navigation", { name: "Wallet transaction pages" });
  await expect(rows).toHaveCount(8);
  await expect(dialog.getByRole("button", { name: "Back to wallet" })).toBeFocused();
  await expect(dialog.locator(".wallet-history__account code")).toHaveAttribute("title", MOCK_WALLET_ADDRESS);
  await expect(pagination.locator("strong")).toHaveText("1");
  await expect(pagination.getByRole("button", { name: "Previous" })).toBeDisabled();

  await pagination.getByRole("button", { name: "Next" }).click();
  await expect(dialog.getByRole("status", { name: "Loading wallet transactions" })).toBeVisible();
  await expect(pagination.getByRole("button", { name: "Next" })).toBeDisabled();
  await expect(rows).toHaveCount(2);
  await expect(pagination.locator("strong")).toHaveText("2");
  await expect(pagination.getByRole("button", { name: "Next" })).toBeDisabled();
  await pagination.getByRole("button", { name: "Previous" }).click();
  await expect(rows).toHaveCount(8);
  await expect(pagination.locator("strong")).toHaveText("1");

  await dialog.getByRole("button", { name: "Back to wallet" }).click();
  await expect(dialog.locator(".wallet-portfolio")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Activity", exact: true })).toBeFocused();
  await expect(page).toHaveURL(/\/bounties\/new$/);
  await expect(page.getByRole("textbox", { name: "Owner", exact: false })).toHaveValue("Alice699");
  expect(historyAddresses.length).toBeGreaterThanOrEqual(3);
  expect(historyAddresses.every((address) => address === MOCK_WALLET_ADDRESS)).toBe(true);
  expect(methods).not.toContain("sendTransaction");
  expect(methods).not.toContain("requestAirdrop");
});

test("wallet transaction details preserve signatures, fees and failed execution without implying payout", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const { dialog } = await prepareWallet(page, "activity-checks");
  await dialog.getByRole("button", { name: "Activity", exact: true }).click();
  const rows = dialog.locator(".wallet-history__row");
  await expect(rows).toHaveCount(8);
  const first = rows.first();
  await expect(first.locator("summary")).toContainText("Funded escrow");
  await first.locator("summary").click();
  const copy = first.locator(".copy-value");
  const signature = await copy.getAttribute("title");
  expect(signature).toMatch(/^E2E/);
  const scan = first.getByRole("link", { name: "Open transaction in Rialo Scan" });
  expect(new URL((await scan.getAttribute("href"))!).searchParams.get("search")).toBe(signature);
  await expect(scan).toHaveAttribute("target", "_blank");
  await copy.click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(signature);
  await expect(first).toContainText("Network fee");
  await expect(first).toContainText("0.0000001 RLO");

  const failed = dialog.locator('.wallet-history__row[data-status="failed"]');
  await expect(failed).toHaveCount(1);
  await expect(failed.locator("summary")).toContainText("Failed");
  await failed.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(failed.locator(".wallet-history__failure")).toContainText("InvalidArgument");
  await expect(dialog.locator(".wallet-history__footer")).toContainText("not necessarily paid");
  await expect(page).toHaveURL(/\/bounties\/new$/);
});

test("a failed refresh keeps the loaded page and its cursors, then retries successfully", async ({ page }) => {
  const { dialog, rpc } = await prepareWallet(page, "activity");
  await dialog.getByRole("button", { name: "Activity", exact: true }).click();
  const rows = dialog.locator(".wallet-history__row");
  const pagination = dialog.getByRole("navigation", { name: "Wallet transaction pages" });
  await expect(rows).toHaveCount(8);
  await pagination.getByRole("button", { name: "Next" }).click();
  await expect(rows).toHaveCount(2);
  rpc.failNextSignatureRead();
  await dialog.getByRole("button", { name: "Refresh wallet transactions" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Latest refresh was interrupted");
  await expect(rows).toHaveCount(2);
  await expect(pagination.locator("strong")).toHaveText("2");
  await dialog.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(rows).toHaveCount(2);
  await pagination.getByRole("button", { name: "Previous" }).click();
  await expect(rows).toHaveCount(8);
  await expect(pagination.locator("strong")).toHaveText("1");
});

test("an initial RPC failure is an error, not empty history, and is recoverable", async ({ page }) => {
  const { dialog, rpc } = await prepareWallet(page, "activity");
  rpc.failNextSignatureRead();
  await dialog.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Activity could not be loaded");
  await expect(dialog.getByRole("heading", { name: "No transactions yet" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(dialog.locator(".wallet-history__row")).toHaveCount(8);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
});

test("going back while RPC is pending ignores the old response and keeps the wallet open", async ({ page }) => {
  const { dialog } = await prepareWallet(page, "activity");
  let release = () => {};
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let held = false;
  await page.route("**/api/rialo", async (route) => {
    const payload = route.request().postDataJSON() as { method: string };
    if (payload.method === "getSignaturesForAddress" && !held) {
      held = true;
      await pending;
    }
    await route.fallback();
  });
  await dialog.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(dialog.getByRole("status", { name: "Loading wallet transactions" })).toBeVisible();
  await expect.poll(() => held).toBe(true);
  await dialog.getByRole("button", { name: "Back to wallet" }).click();
  release();
  await expect(dialog.locator(".wallet-portfolio")).toBeVisible();
  await expect(dialog.locator(".wallet-history")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(dialog.locator(".wallet-history__row")).toHaveCount(8);
  await dialog.getByRole("button", { name: "Close wallet" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".wallet-button")).toBeFocused();
  await page.locator(".wallet-button").click();
  await expect(dialog.locator(".wallet-portfolio")).toBeVisible();
  await expect(page).toHaveURL(/\/bounties\/new$/);
});

for (const scenario of ["empty", "activity-checks"] as const) {
  test(`wallet history ${scenario} stays readable inside desktop and mobile panels`, async ({ page }, testInfo) => {
    const { dialog } = await prepareWallet(page, scenario);
    await dialog.getByRole("button", { name: "Activity", exact: true }).click();
    if (scenario === "empty") {
      await expect(dialog.getByRole("heading", { name: "No transactions yet" })).toBeVisible();
    } else {
      await expect(dialog.locator(".wallet-history__row")).toHaveCount(8);
      await dialog.locator(".wallet-history__row").first().locator("summary").click();
    }
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await dialog.getByRole("button", { name: "Back to wallet" }).focus();
      const bounds = await dialog.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(845);
      expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await dialog.screenshot({ path: testInfo.outputPath(`wallet-history-${scenario}-${width}.png`) });
    }
    if (scenario === "activity-checks") {
      await dialog.getByRole("navigation", { name: "Wallet transaction pages" }).scrollIntoViewIfNeeded();
      await expect(dialog.getByRole("button", { name: "Back to wallet" })).toBeInViewport();
      await expect(dialog.getByRole("button", { name: "Close wallet" })).toBeInViewport();
      await dialog.screenshot({ path: testInfo.outputPath("wallet-history-scrolled-320.png") });
    }
    await expect(page).toHaveURL(/\/bounties\/new$/);
  });
}

for (const [timezoneId, label] of [
  ["UTC", "UTC"],
  ["Asia/Jakarta", "WIB"],
  ["Asia/Makassar", "WITA"],
  ["Asia/Jayapura", "WIT"],
] as const) {
  test.describe(`wallet activity time in ${label}`, () => {
    test.use({ timezoneId });
    test("labels transaction times in the viewer’s timezone", async ({ page }) => {
      const { dialog } = await prepareWallet(page, "activity");
      await dialog.getByRole("button", { name: "Activity", exact: true }).click();
      const time = dialog.locator(".wallet-history__row time").first();
      await expect(time).toContainText(label);
      await expect(time).toHaveAttribute("datetime", /T.+Z$/);
    });
  });
}

test("the local account opens its own onchain history without an extension or signing", async ({ page }) => {
  await installRialoRpcMock(page, "activity");
  await page.goto("/bounties/new");
  await page.locator(".wallet-button").click();
  const dialog = page.getByRole("dialog", { name: "Rialo wallet" });
  await dialog.getByRole("button", { name: "Create local wallet", exact: true }).click();
  const password = "MergePay-inline-history-e2e-only";
  await dialog.getByRole("textbox", { name: /^Wallet password/ }).fill(password);
  await dialog.getByRole("textbox", { name: /^Confirm password/ }).fill(password);
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Create wallet", exact: true }).click();
  const address = await dialog.getByRole("button", { name: /^Copy wallet address/ }).getAttribute("title");
  expect(address).not.toBe(MOCK_WALLET_ADDRESS);
  const read = page.waitForRequest((request) => {
    if (!request.url().endsWith("/api/rialo")) return false;
    const payload = request.postDataJSON() as { method: string; params?: Array<{ address?: string }> };
    return payload.method === "getSignaturesForAddress" && payload.params?.[0]?.address === address;
  });
  await dialog.getByRole("button", { name: "Activity", exact: true }).click();
  await read;
  await expect(dialog.locator(".wallet-history__row")).toHaveCount(8);
  await expect(dialog.locator(".wallet-history__account code")).toHaveAttribute("title", address!);
  await expect(dialog.locator(".wallet-history__account")).toContainText("Local account");
  await expect(page.getByRole("dialog", { name: "Sign transaction" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Back to wallet" }).click();
  await expect(dialog.locator(".wallet-portfolio__account-state")).toHaveText("Unlocked");
});

async function prepareWallet(page: Page, scenario: "empty" | "activity" | "activity-checks") {
  await installMockWallet(page);
  const rpc = await installRialoRpcMock(page, scenario);
  await page.goto("/bounties/new");
  await connectMockWallet(page);
  await page.locator(".wallet-button").click();
  return { dialog: page.getByRole("dialog", { name: "Rialo wallet" }), rpc };
}
