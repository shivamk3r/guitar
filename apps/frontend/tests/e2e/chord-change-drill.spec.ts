import { expect, test } from "@playwright/test";

test.describe("chord change drill", () => {
  test("lets the user pick chords and see the drill UI", async ({ page }) => {
    await page.goto("/practice/chord-change");
    // Default selected chords: G, C, D → drill should render the shell
    await expect(page.getByRole("heading", { name: "Chord change drill" })).toBeVisible();
    await expect(page.getByLabel("BPM")).toHaveValue("60");
  });

  test("falls back to picker when fewer than 2 chords", async ({ page }) => {
    await page.goto("/practice/chord-change");
    // Deselect G, C, D
    for (const name of ["G", "C", "D"]) {
      // The picker buttons include chord id text; scope by role + exact name
      await page
        .getByRole("button", { name: new RegExp(`^${name}$`) })
        .first()
        .click();
    }
    await expect(page.getByText("Pick at least two chords")).toBeVisible();
  });
});
