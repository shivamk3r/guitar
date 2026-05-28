import { expect, test } from "@playwright/test";

test.describe("timed chord practice", () => {
  test("lets the user configure a timed chord session", async ({ page }) => {
    await page.goto("/practice/timed-chords");
    await expect(page.getByRole("heading", { name: "Timed chord practice" })).toBeVisible();
    await expect(page.getByLabel("BPM")).toHaveValue("72");
    await expect(page.getByText("Beat timeline")).toBeVisible();
    await expect(page.getByText(/Using:/)).toBeVisible();

    await page.getByLabel("BPM").fill("84");
    await page.getByLabel("Beats").selectOption("2");
    await page.getByLabel("Order").selectOption("reverse");
    await page.getByLabel("Length").selectOption("8");

    await expect(page.getByLabel("BPM")).toHaveValue("84");
    await expect(page.getByText("84 BPM · 2 beats per chord")).toBeVisible();
  });

  test("can start and stop with the fake browser microphone", async ({ page }) => {
    await page.goto("/practice/timed-chords");
    await page.getByLabel("Length").selectOption("8");
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByText("Next step")).toBeVisible();
  });
});
