import { CHORDS, getChord } from "@/data/chords";
import { describe, expect, it } from "vitest";
import { classifyStrings, expectedRingsMask, matchChord } from "./chord-detection";

describe("matchChord", () => {
  it("matches a C chord's own chroma template to itself", () => {
    const c = getChord("C")!;
    const result = matchChord(c.chroma);
    expect(result.chord?.id).toBe("C");
    expect(result.similarity).toBeGreaterThan(0.9);
  });

  it("prefers G over E for G's chroma template", () => {
    const g = getChord("G")!;
    const result = matchChord(g.chroma, g);
    expect(result.chord?.id).toBe("G");
  });

  it("returns a meaningful runner-up", () => {
    const g = getChord("G")!;
    const result = matchChord(g.chroma);
    expect(result.runnerUp).not.toBeNull();
    expect(result.runnerUp!.chord.id).not.toBe("G");
  });
});

describe("classifyStrings", () => {
  it("classifies all expected-ringing strings as clean when chroma matches exactly", () => {
    const chord = getChord("Em")!;
    const states = classifyStrings(chord, chord.chroma);
    chord.shape.frets.forEach((fret, i) => {
      if (fret >= 0) expect(states[i]).not.toBe("muted");
    });
  });

  it("marks strings muted when chroma has no signal at their pitch class", () => {
    const chord = getChord("G")!;
    const empty = new Float32Array(12); // all zeros
    const states = classifyStrings(chord, empty);
    // Every expected-ringing string should be marked muted
    chord.shape.frets.forEach((fret, i) => {
      if (fret >= 0) expect(states[i]).toBe("muted");
    });
  });
});

describe("expectedRingsMask", () => {
  it("returns false for muted strings (-1) and true for fretted/open", () => {
    const chord = getChord("C")!;
    const mask = expectedRingsMask(chord);
    // C shape: x32010 → string 0 is muted, all others expected to ring
    expect(mask[0]).toBe(false);
    expect(mask[1]).toBe(true);
    expect(mask[2]).toBe(true);
    expect(mask[3]).toBe(true);
    expect(mask[4]).toBe(true);
    expect(mask[5]).toBe(true);
  });
});

describe("CHORDS data", () => {
  it("every chord has a normalized chroma vector", () => {
    for (const c of CHORDS) {
      let norm = 0;
      for (const v of c.chroma) norm += v * v;
      expect(Math.sqrt(norm)).toBeCloseTo(1, 2);
    }
  });
  it("major and minor variants of the same root have different chromas", () => {
    const a = getChord("A")!;
    const am = getChord("Am")!;
    let dist = 0;
    for (let i = 0; i < 12; i++) dist += ((a.chroma[i] ?? 0) - (am.chroma[i] ?? 0)) ** 2;
    expect(dist).toBeGreaterThan(0.01);
  });
});
