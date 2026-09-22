import { test, expect } from "@playwright/test";

/**
 * End-to-end coverage of the paths named in brief §8: onboarding/demo sign-in, dashboard
 * drilldown, and navigating the main routes. Runs against a built app on the DEMO workspace
 * (WORKSPACE_MODE=demo), seeded via prisma/seed/demo-seed.ts. This is NOT a substitute for the
 * unit-tested financial domain logic — it verifies the UI actually surfaces that logic's output.
 */

test("sign in to the demo workspace and see real computed numbers on Overview", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.getByLabel("Email").fill("demo@example.com");
  await page.getByLabel("Password").fill("demo-password-please-change");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Tracked net worth")).toBeVisible();
  // The demo seed always produces income this month, so savings rate must be a percentage, not "—".
  await expect(page.getByText("Savings rate (this month)")).toBeVisible();
});

test("drills from Overview into Spending and sees classified transactions", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@example.com");
  await page.getByLabel("Password").fill("demo-password-please-change");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");

  await page.getByRole("link", { name: "Spending" }).click();
  await expect(page).toHaveURL(/\/spending/);
  await expect(page.getByRole("heading", { name: "Spending" })).toBeVisible();
  // A known demo transaction should be visible with its rule-assigned category.
  await expect(page.getByText("MERCADONA MADRID").first()).toBeVisible();
  await expect(page.getByText("Groceries").first()).toBeVisible();
});

test("Investments page shows synced demo holdings", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@example.com");
  await page.getByLabel("Password").fill("demo-password-please-change");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");

  await page.getByRole("link", { name: "Investments" }).click();
  await expect(page).toHaveURL(/\/investments/);
  await expect(page.getByText("iShares Core MSCI World UCITS ETF")).toBeVisible();
});

test("Connections page shows CaixaBank/imagin/MyInvestor/Trade Republic as unconfigured, not connected", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@example.com");
  await page.getByLabel("Password").fill("demo-password-please-change");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");

  await page.getByRole("link", { name: "Connections" }).click();
  await expect(page).toHaveURL(/\/connections/);
  await expect(page.getByText("CaixaBank", { exact: true })).toBeVisible();
  await expect(page.getByText("Trade Republic", { exact: true })).toBeVisible();
  const unconfigured = page.getByText("UNCONFIGURED");
  await expect(unconfigured.first()).toBeVisible();
});

test("unauthenticated visitors are redirected to login", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
