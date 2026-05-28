import { expect, test } from "@playwright/test";

test.describe("timed chord practice", () => {
  test("lets the user configure a timed chord session", async ({ page }) => {
    await page.goto("/practice/timed-chords");
    await expect(page.getByRole("heading", { name: "Timed chord practice" })).toBeVisible();
    await expect(page.getByLabel("BPM")).toHaveValue("72");
    await expect(page.getByLabel("Count-in")).toHaveValue("4");
    await expect(page.getByText("Beat timeline")).toBeVisible();
    await expect(page.getByLabel("Scrolling beat timeline")).toBeVisible();
    await expect(page.getByText(/Selected:/)).toBeVisible();
    const lengthSelect = page.getByLabel("Length", { exact: true });
    await expect(lengthSelect.locator("option")).toHaveText(["8", "12", "16", "24", "48", "96"]);

    const timelineBox = await page.getByLabel("Scrolling beat timeline").boundingBox();
    const firstChordBox = await page.getByText("First chord").boundingBox();
    const rollingScoreBox = await page.getByText("rolling score").boundingBox();
    expect(timelineBox).not.toBeNull();
    expect(firstChordBox).not.toBeNull();
    expect(rollingScoreBox).not.toBeNull();
    expect(timelineBox!.y + timelineBox!.height).toBeLessThan(firstChordBox!.y);
    expect(timelineBox!.y + timelineBox!.height).toBeLessThan(rollingScoreBox!.y);

    await page.getByLabel("BPM").fill("84");
    await page.getByLabel("Beats").selectOption("2");
    await page.getByLabel("Order").selectOption("reverse");
    await lengthSelect.selectOption("96");
    await page.getByLabel("Count-in").selectOption("2");

    await expect(page.getByLabel("BPM")).toHaveValue("84");
    await expect(page.getByText("84 BPM · 2 beats per chord")).toBeVisible();
    await expect(lengthSelect).toHaveValue("96");
    await expect(page.getByLabel("Count-in")).toHaveValue("2");

    await page.reload();
    await expect(page.getByLabel("Count-in")).toHaveValue("2");
  });

  test("shows contextual learning help and centers the play line", async ({ page }) => {
    await page.goto("/practice/timed-chords");

    await page.getByRole("button", { name: "Open tempo help" }).click();
    await expect(page.getByRole("dialog", { name: "BPM" })).toContainText(
      "BPM means beats per minute",
    );
    await expect(page.getByRole("link", { name: "Tempo" })).toHaveAttribute("href", "/learn/tempo");

    await page.getByRole("button", { name: "Open beat help" }).click();
    await expect(page.getByRole("dialog", { name: "Beats" })).toContainText(
      "how many metronome beats each chord lasts",
    );
    await expect(page.getByRole("link", { name: "Beat" })).toHaveAttribute("href", "/learn/beat");

    await page.getByRole("button", { name: "Open length help" }).click();
    await expect(page.getByRole("dialog", { name: "Length" })).toContainText(
      "number of chord prompts",
    );
    await expect(page.getByRole("dialog", { name: "Length" })).toContainText(
      "length x beats per chord",
    );
    await expect(page.getByRole("link", { name: "Chord", exact: true })).toHaveAttribute(
      "href",
      "/learn/chord",
    );
    await expect(page.getByRole("link", { name: "Beat" })).toHaveAttribute("href", "/learn/beat");

    await page.getByRole("button", { name: "Open timeline help" }).click();
    await expect(page.getByRole("dialog", { name: "Beat timeline" })).toContainText(
      "Yellow bars are the acceptable strum windows",
    );
    await expect(page.getByRole("dialog", { name: "Beat timeline" })).toContainText(
      "timing, chord correctness, and string cleanliness",
    );

    const timeline = page.getByLabel("Scrolling beat timeline");
    const firstWindow = page.getByLabel("A strum window at beat 0");
    const timelineBox = await timeline.boundingBox();
    const windowBox = await firstWindow.boundingBox();
    expect(timelineBox).not.toBeNull();
    expect(windowBox).not.toBeNull();
    const timelineCenter = timelineBox!.x + timelineBox!.width / 2;
    const windowCenter = windowBox!.x + windowBox!.width / 2;
    expect(Math.abs(timelineCenter - windowCenter)).toBeLessThan(4);
  });

  test("can start and stop with the fake browser microphone", async ({ page }) => {
    await page.goto("/practice/timed-chords");
    await page.getByLabel("Length", { exact: true }).selectOption("8");
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await expect(page.getByText("Get ready")).toBeVisible();
    await expect(page.locator("[aria-live='polite']")).toContainText(/Count-in -[1-4]/);
    const timeline = page.getByLabel("Scrolling beat timeline");
    await expect(timeline.getByText("-4", { exact: true })).toBeVisible();
    await expect(timeline.getByText("0", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByText("Next step")).toBeVisible();
  });
});
