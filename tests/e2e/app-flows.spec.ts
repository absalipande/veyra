import { expect, test, type Page } from "@playwright/test";

const E2E_TEST_EMAIL = process.env.E2E_TEST_EMAIL;
const E2E_TEST_PASSWORD = process.env.E2E_TEST_PASSWORD;
const HAS_E2E_CREDENTIALS = Boolean(E2E_TEST_EMAIL && E2E_TEST_PASSWORD);

async function signInViaClerk(page: Page) {
  await page.goto("/sign-in");

  const alreadySignedIn = page.getByRole("heading", { name: /you are already signed in/i });
  if (await alreadySignedIn.isVisible().catch(() => false)) {
    await page.getByRole("link", { name: /go to dashboard/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    return;
  }

  await page.getByLabel(/email address/i).fill(E2E_TEST_EMAIL!);
  await page.getByRole("button", { name: /continue|sign in/i }).first().click();
  await page.getByLabel(/^password$/i).fill(E2E_TEST_PASSWORD!);
  await page.getByRole("button", { name: /continue|sign in/i }).last().click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 });
}

test.describe("authenticated app flows", () => {
  test.skip(
    !HAS_E2E_CREDENTIALS,
    "Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated app flows.",
  );

  test.beforeEach(async ({ page }) => {
    await signInViaClerk(page);
  });

  test("dashboard loads after auth", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: /what to watch next/i })).toBeVisible();
  });

  test("transactions list renders", async ({ page }) => {
    await page.goto("/transactions");
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page.getByRole("heading", { name: /^ledger$/i })).toBeVisible();
    await expect(page.getByPlaceholder(/search events, accounts, or notes/i)).toBeVisible();
  });

  test("create expense flow works", async ({ page }) => {
    const expenseDescription = `Playwright expense ${Date.now()}`;

    await page.goto("/transactions");
    await expect(page.getByRole("heading", { name: /^ledger$/i })).toBeVisible();

    await page.getByRole("button", { name: /^expense/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.getByRole("dialog").getByPlaceholder("0.00").first().fill("123");
    await page.getByRole("dialog").getByRole("button", { name: /select a bank, wallet, or credit account/i }).click();

    const firstAccountOption = page.getByRole("option").first();
    const optionCount = await page.getByRole("option").count();
    test.skip(optionCount === 0, "No spendable account available for expense creation.");
    await firstAccountOption.click();

    await page.getByRole("dialog").getByPlaceholder("Optional short label").fill(expenseDescription);
    await page.getByRole("button", { name: /record expense/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();

    await expect(page.getByText(expenseDescription)).toBeVisible({ timeout: 15_000 });
  });

  test("forecast card renders key metrics", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);

    await expect(page.getByRole("heading", { name: /30-day cashflow forecast/i })).toBeVisible();
    await expect(page.getByText(/Lowest point|Forecast data is unavailable right now\./i)).toBeVisible();
    await expect(page.getByText(/Due in 7 days|Forecast data is unavailable right now\./i)).toBeVisible();
    await expect(page.getByText(/Ending balance|Forecast data is unavailable right now\./i)).toBeVisible();
  });
});
