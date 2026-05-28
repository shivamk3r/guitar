import { CHORDS, getChord } from "@/data/chords";
import { describe, expect, it } from "vitest";
import {
  aggregateChromaFrames,
  classifyStrings,
  expectedRingsMask,
  matchChord,
  verifierThresholdFor,
  verifyChord,
} from "./chord-detection";

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

describe("verifyChord", () => {
  it("accepts the expected chord when its template is clear", () => {
    const c = getChord("C")!;
    const result = verifyChord(c.chroma, c);
    expect(result.status).toBe("accepted");
    expect(result.acceptedChordId).toBe("C");
    expect(result.expectedSimilarity).toBeGreaterThan(0.9);
  });

  it("rejects the expected chord when a confident confuser is better", () => {
    const c = getChord("C")!;
    const g = getChord("G")!;
    const result = verifyChord(g.chroma, c);
    expect(result.status).toBe("rejected");
    expect(result.acceptedChordId).toBeNull();
    expect(result.bestAlternativeChordId).toBe("G");
  });

  it("can return uncertain instead of accepting weak evidence", () => {
    const c = getChord("C")!;
    const weak = new Float32Array(12);
    const result = verifyChord(weak, c);
    expect(result.status).toBe("uncertain");
    expect(result.acceptedChordId).toBeNull();
  });

  it("exposes per-chord thresholds", () => {
    expect(verifierThresholdFor("C").acceptSimilarity).toBeGreaterThan(0);
  });
});

describe("aggregateChromaFrames", () => {
  it("skips transient frames and RMS-weights the aggregate", () => {
    const transient = new Float32Array(12);
    transient[1] = 1;
    const stable = new Float32Array(12);
    stable[0] = 1;

    const aggregate = aggregateChromaFrames([
      { chroma: transient, rms: 0.8, t: 0 },
      { chroma: stable, rms: 0.3, t: 0.09 },
      { chroma: stable, rms: 0.3, t: 0.1 },
    ]);

    expect(aggregate.hasSignal).toBe(true);
    expect(aggregate.avgChroma[0]).toBeGreaterThan(aggregate.avgChroma[1] ?? 0);
    expect(aggregate.framesUsed).toBe(2);
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
