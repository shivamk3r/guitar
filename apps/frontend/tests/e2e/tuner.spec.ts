import { expect, test } from "@playwright/test";

test.describe("tuner", () => {
  test("start listening button shows privacy message and mic request text", async ({ page }) => {
    await page.goto("/tools/tuner");
    await expect(page.getByText(/The tuner needs microphone access/i)).toBeVisible();
    await expect(page.getByText(/Recording only starts if you enabled consent/i)).toBeVisible();
    await expect(page.getByLabel("Microphone")).toBeVisible();
    await expect(page.getByText(/Selected:/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Start listening" })).toBeVisible();
  });

  test("shows the pitch stability trace while listening", async ({ page }) => {
    await page.goto("/tools/tuner");
    await page.getByRole("button", { name: "Start listening" }).click();

    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await expect(page.getByLabel("Microphone")).toBeDisabled();
    await expect(page.getByRole("meter", { name: "Input level" })).toBeVisible();
    await expect(page.getByText(/Using:/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pitch stability" })).toBeVisible();
    await expect(page.getByRole("img", { name: /Pitch stability trace/i })).toBeVisible();
    await expect(page.getByText("Waiting for pitch")).toBeVisible();
  });

  test("tuning selector shows the alternate tunings", async ({ page }) => {
    await page.goto("/tools/tuner");
    const select = page.getByLabel(/Tuning/i);
    await expect(select).toBeVisible();
    await expect(select).toContainText("Standard");
    await expect(select.locator("option")).toContainText(["Drop D", "DADGAD", "Open G"]);
  });
});
