import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:4173";
const startsLocalServer = process.env.E2E_BASE_URL === undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "list",
  expect: {
    timeout: 7_000,
  },
  use: {
    baseURL,
    locale: "en-GB",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    timezoneId: "UTC",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(startsLocalServer
    ? {
        webServer: {
          command: "npm run dev -- --host localhost --port 4173",
          reuseExistingServer: !process.env.CI,
          stderr: "pipe" as const,
          stdout: "pipe" as const,
          timeout: 120_000,
          url: baseURL,
        },
      }
    : {}),
});
