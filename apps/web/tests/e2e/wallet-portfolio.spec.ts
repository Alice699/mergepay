import { expect, test, type Page } from "@playwright/test";
import {
  connectMockWallet,
  installMockWallet,
  installRialoRpcMock,
  MOCK_WALLET_ADDRESS,
} from "./support/rialo-fixture";

// Isolated browser vault and mocked RPC only; no real wallet or funds are used.
const testPassword = "MergePay-wallet-portfolio-e2e-only";

test("the local wallet shows a native RLO portfolio and working security controls", async ({ page }, testInfo) => {
  await installRialoRpcMock(page, "empty");
  await installBalanceMock(page);
  await page.goto("/bounties/new");
  await page.locator(".wallet-button").click();
  const dialog = page.getByRole("dialog", { name: "Rialo wallet" });
  await dialog.getByRole("button", { name: /Create local wallet/ }).click();
  await dialog.getByRole("textbox", { name: /^Wallet password/ }).fill(testPassword);
  await dialog.getByRole("textbox", { name: /^Confirm password/ }).fill(testPassword);
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Create wallet", exact: true }).click();
  await expect(dialog.locator(".wallet-portfolio__amount > strong")).toHaveText("3.95260572");
  await dialog.getByRole("button", { name: "Close wallet" }).click();
  await page.locator(".wallet-button").click();

  const actions = dialog.getByRole("group", { name: "Wallet actions" });
  await expect(actions.locator(":scope > *")).toHaveCount(4);
  await expect(actions.getByRole("button", { name: "Add funds" })).toBeEnabled();
  await expect(dialog).toContainText("DevNet faucet adds 1 RLO per request");
  await expect(dialog.locator(".wallet-token__amount strong")).toHaveText("3.95260572");
  await expect(dialog).not.toContainText(/\$|Buy|Swap/);
  await expect(dialog.getByRole("img", { name: "Rialo logo" })).toHaveAttribute("src", "/rialo-logo.png");
  await expect.poll(() => dialog.getByRole("img", { name: "Rialo logo" }).evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expectWalletWithinViewport(page);
    await expect(actions.getByRole("button", { name: "Receive" })).toBeVisible();
    await expect(dialog.locator(".wallet-token")).toBeVisible();
    await dialog.screenshot({ path: testInfo.outputPath(`local-wallet-${width}.png`) });
  }

  let faucetRequests = 0;
  await page.route("**/api/rialo", async (route) => {
    const request = route.request().postDataJSON() as { id: string | number; method: string };
    if (request.method !== "requestAirdrop") return route.fallback();
    faucetRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: -32098, message: "E2E faucet temporarily unavailable" } }) });
  });
  await actions.getByRole("button", { name: "Add funds", exact: true }).click();
  await expect(actions.getByRole("button", { name: "Funding wallet", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("alert")).toContainText("E2E faucet temporarily unavailable");
  expect(faucetRequests).toBe(1);
  await expect(dialog.locator(".wallet-portfolio__amount > strong")).toHaveText("3.95260572");
  await expect(dialog).not.toContainText("faucet confirmed 1 RLO");

  await dialog.getByRole("button", { name: "Wallet settings", exact: true }).first().click();
  await expect(dialog.getByRole("heading", { name: "Wallet settings" })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /Download backup/ }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/^mergepay-devnet-.+\.wallet\.json$/);
  await expect(dialog.getByRole("status")).toContainText("Encrypted wallet backup downloaded");
  await dialog.getByRole("button", { name: /Lock wallet/ }).click();
  await expect(page.locator(".wallet-button")).toHaveAttribute("aria-label", "Unlock wallet");
  await expect(dialog.locator(".wallet-portfolio")).toHaveCount(0);
  await dialog.getByRole("button", { name: /Unlock local wallet/ }).click();
  await dialog.getByRole("textbox", { name: /^Wallet password/ }).fill(testPassword);
  await dialog.getByRole("button", { name: "Unlock wallet", exact: true }).click();
  await expect(dialog.locator(".wallet-portfolio__amount > strong")).toHaveText("3.95260572");
  await expect(dialog).toContainText("15 min auto-lock");
});

test("Receive exposes the actual wallet address and Activity opens the existing wallet-scoped page", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await prepareExtensionWallet(page);
  const dialog = page.getByRole("dialog", { name: "Rialo wallet" });
  const actions = dialog.getByRole("group", { name: "Wallet actions" });
  await expect(actions.getByRole("button", { name: "Add funds" })).toHaveCount(0);
  await actions.getByRole("button", { name: "Receive" }).click();
  await expect(actions.getByRole("button", { name: "Receive" })).toHaveAttribute("aria-expanded", "true");
  const receive = dialog.getByRole("region", { name: "Receive RLO" });
  await expect(receive.locator("code")).toHaveText(MOCK_WALLET_ADDRESS);
  await expect(receive).toContainText("Only send RLO on Rialo DevNet");
  await expectWalletWithinViewport(page);
  await receive.getByRole("button", { name: "Copy address", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Signer address copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(MOCK_WALLET_ADDRESS);
  await receive.getByRole("button", { name: "Close receiving address" }).click();
  await expect(receive).toHaveCount(0);
  await actions.getByRole("link", { name: "Activity", exact: true }).click();
  await expect(page).toHaveURL(/\/activity$/);
  await expect(page.getByRole("dialog", { name: "Rialo wallet" })).toHaveCount(0);
  await expect(page.locator(".wallet-button")).toHaveAttribute("aria-label", /^Active wallet /);
});

test("balance refresh shows loading, errors and real precision instead of a fabricated zero", async ({ page }, testInfo) => {
  const balance = await prepareExtensionWallet(page);
  const dialog = page.getByRole("dialog", { name: "Rialo wallet" });
  const amount = dialog.locator(".wallet-portfolio__amount");
  balance.set("123456789123456789");
  await dialog.getByRole("button", { name: "Refresh wallet balance" }).click();
  await expect(amount).toContainText("Updating balance");
  await expect(dialog.getByRole("button", { name: "Refresh wallet balance" })).toBeDisabled();
  await expect(amount.locator("strong")).toHaveText("123456789.123456789");
  await expect(dialog.locator(".wallet-token__amount strong")).toHaveText("123456789.123456789");
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expectWalletWithinViewport(page);
    // Even a large native balance is shown in full, without splitting digits.
    expect(await amount.locator("strong").evaluate((element) => {
      const style = getComputedStyle(element);
      return element.getBoundingClientRect().height <= parseFloat(style.lineHeight) + 1;
    })).toBe(true);
    await dialog.screenshot({ path: testInfo.outputPath(`large-balance-${width}.png`) });
  }

  balance.failNext();
  await dialog.getByRole("button", { name: "Refresh wallet balance" }).click();
  await expect(amount).toContainText("Unavailable");
  await expect(dialog.locator(".wallet-token__amount")).toContainText("Balance not verified");
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(amount.locator("strong")).not.toHaveText("0");
  balance.set("4952605720");
  await dialog.getByRole("button", { name: "Refresh wallet balance" }).click();
  await expect(amount.locator("strong")).toHaveText("4.95260572");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.locator(".wallet-button")).toHaveAttribute("aria-label", "Open wallet");
  await expect(dialog.locator(".wallet-portfolio")).toHaveCount(0);
});

async function prepareExtensionWallet(page: Page) {
  await installMockWallet(page);
  await installRialoRpcMock(page, "empty");
  const balance = await installBalanceMock(page);
  await page.goto("/bounties/new");
  await connectMockWallet(page);
  await page.locator(".wallet-button").click();
  await expect(page.locator(".wallet-portfolio__amount > strong")).toHaveText("3.95260572");
  return balance;
}

async function installBalanceMock(page: Page) {
  let kelvin = "3952605720";
  let shouldFail = false;
  await page.route("**/api/rialo", async (route) => {
    const request = route.request().postDataJSON() as { id: string | number; method: string };
    if (request.method !== "getBalance") return route.fallback();
    const failed = shouldFail;
    shouldFail = false;
    // A delayed RPC response makes the visible loading transition deterministic.
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: request.id, ...(failed ? { error: { code: -32098, message: "E2E balance temporarily unavailable" } } : { result: { value: kelvin } }) }) });
  });
  return { set: (value: string) => { kelvin = value; }, failNext: () => { shouldFail = true; } };
}

async function expectWalletWithinViewport(page: Page) {
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  await expect.poll(() => page.locator(".wallet-popover").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= window.innerWidth + 1 && element.scrollWidth <= element.clientWidth + 1;
  })).toBe(true);
}
