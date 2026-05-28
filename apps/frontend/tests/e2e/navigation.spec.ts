import { expect, test } from "@playwright/test";

test.describe("navigation", () => {
  test("home page loads the tuner", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Tuner" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start listening" })).toBeVisible();
  });

  test("can navigate between the primary sections", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Chord Library" }).click();
    await expect(page.getByRole("heading", { name: "Chord Library" })).toBeVisible();
    await page.getByRole("link", { name: "Practice" }).click();
    await expect(page.getByRole("heading", { name: "Practice" })).toBeVisible();
    await page.getByRole("link", { name: "Learn" }).click();
    await expect(page.getByRole("heading", { name: "Learn" })).toBeVisible();
    await page.getByRole("link", { name: "Tuner" }).click();
    await expect(page.getByRole("heading", { name: "Tuner" })).toBeVisible();
  });

  test("learn glossary supports search, category filters, and concept pages", async ({ page }) => {
    await page.goto("/learn");
    await expect(page.getByRole("heading", { name: "Learn" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Pitch\b/ })).toBeVisible();

    const search = page.getByPlaceholder(/Search/i);
    await search.fill("bpm");
    await expect(page.getByRole("link", { name: /^Tempo\b/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Pitch\b/ })).not.toBeVisible();

    await search.fill("");
    await page.getByRole("button", { name: "Timing" }).click();
    await expect(page.getByRole("link", { name: /^Beat\b/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Rhythm\b/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Fret\b/ })).not.toBeVisible();

    await page.getByRole("link", { name: /^Tempo\b/ }).click();
    await expect(page.getByRole("heading", { name: "Tempo" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Tempo animated concept visual" })).toBeVisible();
    await expect(page.getByRole("button", { name: /70 BPM/ })).toBeVisible();
    await expect(page.getByText(/Practice screens let you set BPM/i)).toBeVisible();
  });

  test("chord library lists chord tiers", async ({ page }) => {
    await page.goto("/chords");
    await expect(page.getByText(/First chords/i)).toBeVisible();
    await expect(page.getByText(/Dominant 7ths/i)).toBeVisible();
    await expect(page.getByText(/Power chords/i)).toBeVisible();
  });

  test("chord detail page renders a chord", async ({ page }) => {
    await page.goto("/chords/G");
    await expect(page.getByRole("heading", { name: /^G$/ })).toBeVisible();
    await expect(page.getByRole("img", { name: "G chord diagram" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Play reference" })).toBeVisible();
  });

  test("chord library search filters results", async ({ page }) => {
    await page.goto("/chords");
    const search = page.getByPlaceholder(/Search/i);
    await search.fill("minor");
    // Am, Em, Dm should still be visible
    await expect(page.getByRole("link").filter({ hasText: "A minor" })).toBeVisible();
    // Major G should not be visible
    await expect(page.getByRole("link").filter({ hasText: /^G$/ })).not.toBeVisible();
  });

  test("practice page shows drills and progressions", async ({ page }) => {
    await page.goto("/practice");
    await expect(page.getByText("Chord change drill")).toBeVisible();
    await expect(page.getByText("Strumming pattern drill")).toBeVisible();
    await expect(page.getByText(/I–IV–V in G/)).toBeVisible();
  });

  test("settings page renders and can toggle audible metronome", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    const checkbox = page.getByRole("checkbox", { name: "Audible metronome" });
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    await expect(checkbox).toBeChecked();
  });
});
