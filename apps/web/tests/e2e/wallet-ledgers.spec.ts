import { expect, test, type Page } from "@playwright/test";
import {
  connectMockWallet,
  installMockWallet,
  installRialoRpcMock,
} from "./support/rialo-fixture";

test.describe("wallet-aware ledgers", () => {
  test("opens the wallet control from the Activity empty state without reloading", async ({
    page,
  }) => {
    await installRialoRpcMock(page, "empty");
    await page.goto("/activity");

    await expect(
      page.getByRole("heading", {
        level: 3,
        name: "Connect a wallet to see activity",
      }),
    ).toBeVisible();
    await expect(page.locator(".wallet-button")).toHaveAttribute(
      "aria-label",
      "Open wallet",
    );
    await expect(page.locator(".wallet-button")).toBeEnabled();

    await page
      .locator(".wallet-activity__empty-action")
      .getByRole("button", { name: "Open wallet" })
      .click();

    await expect(page.getByRole("dialog", { name: "Rialo wallet" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Open a Rialo wallet" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/activity$/);
    await expect.poll(() => navigationCount(page)).toBe(1);
  });

  test("paginates Activity through a visible loading transition", async ({
    page,
  }) => {
    await installMockWallet(page);
    await installRialoRpcMock(page, "activity");
    await page.goto("/activity");
    await connectMockWallet(page);

    const rows = page.locator(".wallet-activity__row");
    const pageStatus = page.locator(".wallet-activity__page-status strong");
    await expect(rows).toHaveCount(8);
    await expect(pageStatus).toHaveText("01");

    await page
      .getByRole("navigation", { name: "Wallet activity pages" })
      .getByRole("button", { name: "Go to activity page 2" })
      .click();

    await expect(page.getByRole("status", { name: "Loading activity page" })).toBeVisible();
    await expect(rows).toHaveCount(2);
    await expect(pageStatus).toHaveText("02");

    await page
      .getByRole("navigation", { name: "Wallet activity pages" })
      .getByRole("button", { name: "Go to activity page 1" })
      .click();
    await expect(rows).toHaveCount(8);
    await expect(pageStatus).toHaveText("01");
    await expect.poll(() => navigationCount(page)).toBe(1);
  });

  test("keeps verified Settlements visible when a refresh is interrupted", async ({
    page,
  }) => {
    await installMockWallet(page);
    const rpc = await installRialoRpcMock(page, "settlements");
    await page.goto("/settlements");
    await connectMockWallet(page);

    const rows = page.locator(".settlement-activity__row");
    const pagination = page.getByRole("navigation", {
      name: "Settlement history pages",
    });
    const pageStatus = pagination.locator("strong");
    await expect(rows).toHaveCount(6);
    await expect(pageStatus).toHaveText("01");
    await expect(page.getByText("6 settlements", { exact: true })).toBeVisible();

    await pagination.getByRole("button", { name: "Next", exact: true }).click();
    await expect(
      page.getByRole("status", { name: "Loading settlement page" }),
    ).toBeVisible();
    await expect(rows).toHaveCount(1);
    await expect(pageStatus).toHaveText("02");
    await expect(page.getByText("Alice699/mergepay-e2e-7")).toBeVisible();

    await pagination
      .getByRole("button", { name: "Previous", exact: true })
      .click();
    await expect(rows).toHaveCount(6);
    await expect(pageStatus).toHaveText("01");

    rpc.failNextSignatureRead();
    await page.getByRole("button", { name: "Refresh settlement history" }).click();
    await expect(rows).toHaveCount(6);
    await expect(page.getByText("Latest sync was interrupted")).toBeVisible();
    await expect(rows).toHaveCount(6);
    await expect(pageStatus).toHaveText("01");
    await expect.poll(() => navigationCount(page)).toBe(1);
  });

  test("keeps both wallet-ledger empty states inside a mobile viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installRialoRpcMock(page, "empty");

    for (const [path, title] of [
      ["/activity", "Connect a wallet to see activity"],
      ["/settlements", "Connect a wallet to see settlements"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 3, name: title })).toBeVisible();
      await expect(page.getByRole("button", { name: "Open wallet", exact: true }).last()).toBeVisible();

      const overflow = await horizontalOverflow(page);
      expect(
        overflow.amount,
        `Elements outside the viewport: ${JSON.stringify(overflow.offenders)}`,
      ).toBeLessThanOrEqual(1);
    }
  });

  test("expands repeated checks without hiding failed transactions or losing signatures", async ({ page }) => {
    await installMockWallet(page);
    await installRialoRpcMock(page, "activity-checks");
    await page.goto("/activity");
    await connectMockWallet(page);

    const group = page.locator(".wallet-activity__group");
    await expect(group).toHaveCount(1);
    await expect(group.locator("summary")).toContainText("4 merge checks");
    await expect(page.locator('.wallet-activity__row[data-status="failed"]')).toBeVisible();
    await expect(page.locator(".wallet-activity__row:visible")).toHaveCount(4);
    await expect(page.locator(".wallet-activity__summary")).toContainText("8 transactions");

    await group.locator("summary").click();
    await expect(group).toHaveAttribute("open", "");
    await expect(page.locator(".wallet-activity__row:visible")).toHaveCount(8);
    await expect(group.locator(".transaction-proof__link")).toHaveCount(4);
    await expect(group.locator(".transaction-proof .copy-value").first()).toHaveAttribute("aria-label", /^Copy E2E/);

    await group.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(group).not.toHaveAttribute("open", "");
    await expect(page.locator('.wallet-activity__row[data-status="failed"]')).toBeVisible();
  });

  test("shows both terminal outcomes with prominent amounts and complete receipt links", async ({ page }) => {
    await installMockWallet(page);
    await installRialoRpcMock(page, "settlements");
    await page.goto("/settlements");
    await connectMockWallet(page);

    await expect(page.locator('.settlement-activity__row[data-outcome="paid"]')).toHaveCount(3);
    await expect(page.locator('.settlement-activity__row[data-outcome="refunded"]')).toHaveCount(3);
    await expect(page.locator(".settlement-activity__legend")).toContainText("3 paid");
    await expect(page.locator(".settlement-activity__legend")).toContainText("3 refunded");
    await expect(page.locator(".settlement-activity__list")).not.toContainText(/paid = true|refunded = true/);

    for (const row of await page.locator(".settlement-activity__row").all()) {
      await expect(row.locator(".settlement-activity__amount")).toContainText("RLO");
      await expect(row.getByRole("link", { name: /^View receipt for/ })).toHaveAttribute("href", /account=.+&sponsor=.+&tx=E2E/);
      await expect(row.locator(".settlement-github-link")).toHaveAttribute("href", /github\.com\/Alice699\/mergepay-e2e-\d\/pull\/\d+/);
      await expect(row.locator("time")).toContainText("UTC");
    }
  });

  for (const [path, scenario, rowSelector] of [
    ["/activity", "activity-checks", ".wallet-activity__row"],
    ["/settlements", "settlements", ".settlement-activity__row"],
  ] as const) {
    test(`keeps populated ${path} readable on desktop, tablet, and small phones`, async ({ page }, testInfo) => {
      await installMockWallet(page);
      await installRialoRpcMock(page, scenario);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(path);
      await connectMockWallet(page);
      await expect(page.locator(rowSelector).first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        const overflow = await horizontalOverflow(page);
        expect(overflow.amount, JSON.stringify(overflow.offenders)).toBeLessThanOrEqual(1);
        await page.screenshot({ path: testInfo.outputPath(`${path.slice(1)}-${width}.png`), fullPage: width >= 768 });
      }
    });
  }
});

async function navigationCount(page: Page): Promise<number> {
  return page.evaluate(
    () => performance.getEntriesByType("navigation").length,
  );
}

async function horizontalOverflow(page: Page): Promise<{
  amount: number;
  offenders: Array<{
    clientWidth: number;
    element: string;
    left: number;
    right: number;
    scrollWidth: number;
    width: number;
  }>;
}> {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const offenders = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          element: [
            element.tagName.toLowerCase(),
            element.id ? `#${element.id}` : "",
            ...Array.from(element.classList, (className) => `.${className}`),
          ].join(""),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          width: Math.round(rect.width),
        };
      })
      .filter(({ clientWidth, left, right, scrollWidth, width }) =>
        width > 0 &&
        (left < -1 ||
          right > viewportWidth + 1 ||
          scrollWidth > clientWidth + 1),
      )
      .sort(
        (left, right) =>
          right.scrollWidth - right.clientWidth -
          (left.scrollWidth - left.clientWidth),
      )
      .slice(0, 12);

    return {
      amount:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      offenders,
    };
  });
}
