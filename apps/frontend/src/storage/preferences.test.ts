import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMED_PRACTICE_COUNT_IN_BEATS,
  TIMED_PRACTICE_COUNT_IN_OPTIONS,
  normalizeTimedPracticeCountInBeats,
} from "./preferences";

describe("timed practice count-in preference", () => {
  it("defaults to a four-beat count-in", () => {
    expect(DEFAULT_TIMED_PRACTICE_COUNT_IN_BEATS).toBe(4);
  });

  it("offers off, two, four, and eight beat options", () => {
    expect(TIMED_PRACTICE_COUNT_IN_OPTIONS).toEqual([0, 2, 4, 8]);
  });

  it("normalizes unknown stored values back to the default", () => {
    expect(normalizeTimedPracticeCountInBeats(undefined)).toBe(4);
    expect(normalizeTimedPracticeCountInBeats(3)).toBe(4);
    expect(normalizeTimedPracticeCountInBeats("4")).toBe(4);
  });

  it("preserves supported stored values", () => {
    expect(normalizeTimedPracticeCountInBeats(0)).toBe(0);
    expect(normalizeTimedPracticeCountInBeats(2)).toBe(2);
    expect(normalizeTimedPracticeCountInBeats(4)).toBe(4);
    expect(normalizeTimedPracticeCountInBeats(8)).toBe(8);
  });
});
