import { describe, expect, it } from "vitest";
import { rollingAverage, scoreEvent } from "./scoring";

describe("scoreEvent", () => {
  const allClean = ["clean", "clean", "clean", "clean", "clean", "clean"] as const;
  const fiveExpected = [false, true, true, true, true, true] as const; // A major shape

  it("10 for a perfect chord check", () => {
    const r = scoreEvent({
      expectedChordId: "G",
      detectedChordId: "G",
      strings: allClean,
      expectedRings: [true, true, true, true, true, true],
      timingApplies: false,
    });
    expect(r.score).toBe(10);
  });

  it("mostly-correct with one muted string lands in 7-9", () => {
    const r = scoreEvent({
      expectedChordId: "A",
      detectedChordId: "A",
      strings: ["muted", "clean", "muted", "clean", "clean", "clean"],
      expectedRings: fiveExpected,
      timingApplies: false,
    });
    expect(r.score).toBeGreaterThanOrEqual(7);
    expect(r.score).toBeLessThanOrEqual(9);
  });

  it("caps at 3 when the wrong chord is played", () => {
    const r = scoreEvent({
      expectedChordId: "G",
      detectedChordId: "F",
      sameFamily: false,
      strings: allClean,
      expectedRings: [true, true, true, true, true, true],
      timingApplies: true,
      timingDeltaMs: 0,
      strumDetected: true,
    });
    expect(r.score).toBeLessThanOrEqual(3);
  });

  it("partial credit when detected is the same family", () => {
    const r = scoreEvent({
      expectedChordId: "C",
      detectedChordId: "Cmaj7" as string,
      sameFamily: true,
      strings: allClean,
      expectedRings: [true, true, true, true, true, true],
      timingApplies: false,
    });
    // correctness 7, cleanliness 10, timing 10 → 0.2*7 + 0.5*10 + 0.3*10 = 9.4 → 9
    expect(r.score).toBeGreaterThanOrEqual(8);
    expect(r.score).toBeLessThan(10);
  });

  it("timing brackets follow the spec", () => {
    const base = {
      expectedChordId: "G",
      detectedChordId: "G",
      strings: allClean,
      expectedRings: [true, true, true, true, true, true] as boolean[],
      timingApplies: true,
      strumDetected: true,
    };
    const within25 = scoreEvent({ ...base, timingDeltaMs: 20 });
    const within50 = scoreEvent({ ...base, timingDeltaMs: 45 });
    const within100 = scoreEvent({ ...base, timingDeltaMs: 90 });
    const within150 = scoreEvent({ ...base, timingDeltaMs: 140 });
    expect(within25.timing).toBe(10);
    expect(within50.timing).toBe(9);
    expect(within100.timing).toBe(7);
    expect(within150.timing).toBe(5);
  });

  it("scores the timing-only contribution when nothing rings", () => {
    // Nothing rings: C=0, L=0, T=10 → 0.2·0 + 0.5·0 + 0.3·10 = 3
    const r = scoreEvent({
      expectedChordId: "G",
      detectedChordId: undefined,
      strings: ["muted", "muted", "muted", "muted", "muted", "muted"],
      expectedRings: [true, true, true, true, true, true],
      timingApplies: true,
      timingDeltaMs: 0,
      strumDetected: true,
    });
    expect(r.score).toBe(3);
  });

  it("never scores 0 when there was any signal (clamped to 1)", () => {
    // Wrong chord + muted + no strum in window → correctness 0, cleanliness 0, timing 0.
    // Raw would be 0 but clamp enforces minimum 1.
    const r = scoreEvent({
      expectedChordId: "G",
      detectedChordId: undefined,
      strings: ["muted", "muted", "muted", "muted", "muted", "muted"],
      expectedRings: [true, true, true, true, true, true],
      timingApplies: true,
      strumDetected: false,
    });
    expect(r.score).toBe(1);
  });

  it("weakest-component cue is the string that's worst", () => {
    const r = scoreEvent({
      expectedChordId: "G",
      detectedChordId: "G",
      strings: ["clean", "clean", "clean", "clean", "muted", "clean"],
      expectedRings: [true, true, true, true, true, true],
      timingApplies: false,
    });
    expect(r.weakComponent).toBe("cleanliness");
    expect(r.cue).toContain("muted");
  });

  it("late strum produces a 'late by Nms' cue", () => {
    const r = scoreEvent({
      expectedChordId: "G",
      detectedChordId: "G",
      strings: allClean,
      expectedRings: [true, true, true, true, true, true],
      timingApplies: true,
      timingDeltaMs: 120,
      strumDetected: true,
    });
    expect(r.cue).toMatch(/late by \d+/);
  });
});

describe("rollingAverage", () => {
  it("averages the last 8 events", () => {
    expect(rollingAverage([10, 10, 10, 10])).toBe(10);
    expect(rollingAverage([6, 7, 8, 9, 10])).toBeCloseTo(8, 5);
    expect(
      rollingAverage(
        Array.from({ length: 20 }, () => 5),
        8,
      ),
    ).toBe(5);
  });
  it("handles empty input", () => {
    expect(rollingAverage([])).toBe(0);
  });
});
