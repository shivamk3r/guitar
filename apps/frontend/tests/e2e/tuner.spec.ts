import { expect, test } from "@playwright/test";

test.describe("tuner", () => {
  test("start listening button shows privacy message and mic request text", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Recording only starts if you enabled consent/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Start listening" })).toBeVisible();
  });

  test("tuning selector shows the alternate tunings", async ({ page }) => {
    await page.goto("/");
    const select = page.getByLabel(/Tuning/i);
    await expect(select).toBeVisible();
    await expect(select).toContainText("Standard");
    await expect(select.locator("option")).toContainText(["Drop D", "DADGAD", "Open G"]);
  });
});
