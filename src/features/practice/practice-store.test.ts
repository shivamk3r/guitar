import { beforeEach, describe, expect, it } from "vitest";
import { suggestBpmChange, usePractice } from "./practice-store";
import type { ScoredEvent } from "./scoring";

function makeEvent(score: number): ScoredEvent {
  return {
    score,
    correctness: 10,
    cleanliness: 10,
    timing: 10,
    weakComponent: "timing",
    cue: "",
  };
}

describe("practice-store", () => {
  beforeEach(() => {
    usePractice.getState().reset();
  });

  it("records events and updates rolling average", () => {
    const store = usePractice.getState();
    store.recordEvent({
      id: "1",
      atIso: new Date().toISOString(),
      expectedChordId: "G",
      detectedChordId: "G",
      score: makeEvent(8),
      bpm: 60,
    });
    expect(usePractice.getState().rollingAverage).toBe(8);
    store.recordEvent({
      id: "2",
      atIso: new Date().toISOString(),
      expectedChordId: "C",
      detectedChordId: "C",
      score: makeEvent(6),
      bpm: 60,
    });
    expect(usePractice.getState().rollingAverage).toBe(7);
  });
});

describe("suggestBpmChange", () => {
  it("returns null with fewer than 8 scores", () => {
    expect(suggestBpmChange(60, [8, 9, 10])).toBeNull();
  });
  it("suggests +5 when rolling avg ≥ 8", () => {
    const s = suggestBpmChange(60, [8, 8, 9, 9, 9, 10, 10, 9]);
    expect(s).toEqual({ direction: "up", from: 60, to: 65 });
  });
  it("suggests −5 when rolling avg ≤ 5", () => {
    const s = suggestBpmChange(80, [3, 4, 5, 5, 5, 4, 5, 5]);
    expect(s).toEqual({ direction: "down", from: 80, to: 75 });
  });
  it("keeps BPM above 40", () => {
    const s = suggestBpmChange(42, [3, 4, 5, 5, 5, 4, 5, 5]);
    expect(s).toEqual({ direction: "down", from: 42, to: 40 });
  });
  it("returns null in the middle band", () => {
    expect(suggestBpmChange(60, [6, 7, 7, 6, 7, 6, 7, 7])).toBeNull();
  });
});
