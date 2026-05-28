import { cosineSimilarity } from "@/audio/dsp/chroma";
import { CHORDS, type ChordDef } from "@/data/chords";

export type ChordStringClass = "clean" | "dull" | "muted" | "wrong";

export interface ChordMatchResult {
  chord: ChordDef | null;
  similarity: number;
  runnerUp: { chord: ChordDef; similarity: number } | null;
  sameFamily: boolean;
}

export function matchChord(capturedChroma: Float32Array, expected?: ChordDef): ChordMatchResult {
  let bestChord: ChordDef | null = null;
  let bestSim = Number.NEGATIVE_INFINITY;
  let secondChord: ChordDef | null = null;
  let secondSim = Number.NEGATIVE_INFINITY;
  for (const chord of CHORDS) {
    const sim = cosineSimilarity(capturedChroma, chord.chroma);
    if (sim > bestSim) {
      secondChord = bestChord;
      secondSim = bestSim;
      bestChord = chord;
      bestSim = sim;
    } else if (sim > secondSim) {
      secondChord = chord;
      secondSim = sim;
    }
  }
  const sameFamily = expected != null && bestChord != null && bestChord.root === expected.root;
  return {
    chord: bestChord,
    similarity: bestSim,
    runnerUp: secondChord ? { chord: secondChord, similarity: secondSim } : null,
    sameFamily,
  };
}

/**
 * Per-string classification from captured chroma.
 *
 * Chroma collapses octaves, so two expected strings at the same pitch class share a verdict.
 * That's a deliberate v1 trade-off — the worklet stays lean and the signal is still actionable.
 */
export function classifyStrings(
  expected: ChordDef,
  capturedChroma: Float32Array,
): ChordStringClass[] {
  let maxPc = 0;
  for (let i = 0; i < 12; i++) maxPc = Math.max(maxPc, capturedChroma[i] ?? 0);
  if (maxPc === 0) return expected.playedMidi.map((m) => (m == null ? "muted" : "muted"));
  const threshold = {
    clean: 0.45 * maxPc,
    dull: 0.18 * maxPc,
  };
  return expected.playedMidi.map((m) => {
    if (m == null) return "muted";
    const pc = ((m % 12) + 12) % 12;
    const v = capturedChroma[pc] ?? 0;
    if (v >= threshold.clean) return "clean";
    if (v >= threshold.dull) return "dull";
    return "muted";
  });
}

export function expectedRingsMask(chord: ChordDef): boolean[] {
  return chord.shape.frets.map((f) => f >= 0);
}
