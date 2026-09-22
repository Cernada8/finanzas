import { test, expect } from "@playwright/test";
import path from "node:path";

/**
 * Covers the import preview/commit path named in brief §8, using a semicolon-delimited, es-ES
 * formatted CSV — the realistic shape of a Spanish bank export (comma as decimal separator means
 * comma can't also be the field delimiter).
 */
test("imports a CSV statement, auto-detects columns, and the rows show up on Spending", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@example.com");
  await page.getByLabel("Password").fill("demo-password-please-change");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");

  await page.getByRole("link", { name: "Connections" }).click();
  await expect(page).toHaveURL(/\/connections/);

  await page.locator('select[name="accountId"]').selectOption({ label: "Demo Checking (imagin)" });
  await page.locator('input[name="file"]').setInputFiles(path.join(__dirname, "fixtures", "sample-import.csv"));
  await page.getByRole("button", { name: "Import" }).click();

  // Idempotent: a second run of this test (same file) hits the "already imported" branch instead
  // of "Imported N row(s)" — both are success states, so accept either.
  await expect(page.getByText(/Imported \d+ row|already imported/)).toBeVisible({ timeout: 10_000 });

  await page.goto("/spending?month=2026-09");
  await expect(page.getByText("FARMACIA FUENLABRADA")).toBeVisible();
  await expect(page.getByText("LIBRERIA CENTRAL")).toBeVisible();
});
