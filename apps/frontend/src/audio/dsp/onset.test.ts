import { describe, expect, it } from "vitest";
import { OnsetDetector } from "./onset";

describe("OnsetDetector", () => {
  it("does not trigger on flat spectrum", () => {
    const detector = new OnsetDetector(129, 10);
    const flat = new Float32Array(129).fill(0.2);
    let onsets = 0;
    for (let i = 0; i < 50; i++) {
      if (detector.process(flat).onset) onsets++;
    }
    expect(onsets).toBe(0);
  });

  it("triggers on a sudden energy increase", () => {
    const detector = new OnsetDetector(129, 10);
    const low = new Float32Array(129).fill(0.05);
    const hi = new Float32Array(129).fill(0.8);
    // warm up with low spectra
    for (let i = 0; i < 20; i++) detector.process(low);
    const r = detector.process(hi);
    expect(r.onset).toBe(true);
  });

  it("has a cooldown to prevent double-firing", () => {
    const detector = new OnsetDetector(129, 10, { minGapMs: 50 });
    const low = new Float32Array(129).fill(0.05);
    const hi = new Float32Array(129).fill(0.8);
    for (let i = 0; i < 20; i++) detector.process(low);
    let onsetsInARow = 0;
    for (let i = 0; i < 3; i++) {
      if (detector.process(hi).onset) onsetsInARow++;
    }
    expect(onsetsInARow).toBe(1);
  });
});
