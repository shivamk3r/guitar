import { cosineSimilarity } from "@/audio/dsp/chroma";
import { CHORDS, type ChordDef } from "@/data/chords";
import thresholdConfig from "./chord-verifier-thresholds.json";

export type ChordStringClass = "clean" | "dull" | "muted" | "wrong";
export type ChordVerifierStatus = "accepted" | "rejected" | "uncertain";

export interface ChordMatchResult {
  chord: ChordDef | null;
  similarity: number;
  runnerUp: { chord: ChordDef; similarity: number } | null;
  sameFamily: boolean;
}

export interface ChordVerifierThreshold {
  acceptSimilarity: number;
  acceptMargin: number;
  rejectAlternativeSimilarity: number;
  rejectMargin: number;
}

export interface ChordVerifierResult {
  status: ChordVerifierStatus;
  expectedChordId: string;
  acceptedChordId: string | null;
  bestAlternativeChordId: string | null;
  expectedSimilarity: number;
  alternativeSimilarity: number | null;
  margin: number;
  confidence: number;
}

export interface ChromaFrame {
  chroma: Float32Array;
  rms?: number;
  t?: number;
}

export interface ChromaAggregateResult {
  avgChroma: Float32Array;
  hasSignal: boolean;
  framesUsed: number;
  framesReceived: number;
}

interface ChordVerifierThresholdFile {
  default: ChordVerifierThreshold;
  perChord: Record<string, ChordVerifierThreshold>;
}

const CHORD_VERIFIER_THRESHOLDS = thresholdConfig as ChordVerifierThresholdFile;
const DEFAULT_TRANSIENT_SKIP_MS = 80;
const DEFAULT_TRIM_RATIO = 0.15;

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

export function verifyChord(capturedChroma: Float32Array, expected: ChordDef): ChordVerifierResult {
  const expectedSimilarity = cosineSimilarity(capturedChroma, expected.chroma);
  let bestAlternative: ChordDef | null = null;
  let alternativeSimilarity = Number.NEGATIVE_INFINITY;
  for (const chord of CHORDS) {
    if (chord.id === expected.id) continue;
    const sim = cosineSimilarity(capturedChroma, chord.chroma);
    if (sim > alternativeSimilarity) {
      alternativeSimilarity = sim;
      bestAlternative = chord;
    }
  }

  const threshold = verifierThresholdFor(expected.id);
  const margin =
    bestAlternative == null ? expectedSimilarity : expectedSimilarity - alternativeSimilarity;
  const accepted =
    expectedSimilarity >= threshold.acceptSimilarity && margin >= threshold.acceptMargin;
  const rejected =
    !accepted &&
    bestAlternative != null &&
    alternativeSimilarity >= threshold.rejectAlternativeSimilarity &&
    alternativeSimilarity - expectedSimilarity >= threshold.rejectMargin;

  return {
    status: accepted ? "accepted" : rejected ? "rejected" : "uncertain",
    expectedChordId: expected.id,
    acceptedChordId: accepted ? expected.id : null,
    bestAlternativeChordId: bestAlternative?.id ?? null,
    expectedSimilarity,
    alternativeSimilarity: bestAlternative == null ? null : alternativeSimilarity,
    margin,
    confidence: confidenceFor({
      accepted,
      rejected,
      expectedSimilarity,
      alternativeSimilarity,
      margin,
      threshold,
    }),
  };
}

export function verifierThresholdFor(chordId: string): ChordVerifierThreshold {
  return CHORD_VERIFIER_THRESHOLDS.perChord[chordId] ?? CHORD_VERIFIER_THRESHOLDS.default;
}

export function aggregateChromaFrames(
  frames: readonly ChromaFrame[],
  options: {
    transientSkipMs?: number;
    trimRatio?: number;
  } = {},
): ChromaAggregateResult {
  const avgChroma = new Float32Array(12);
  if (frames.length === 0) return { avgChroma, hasSignal: false, framesReceived: 0, framesUsed: 0 };

  const transientSkipMs = options.transientSkipMs ?? DEFAULT_TRANSIENT_SKIP_MS;
  const trimRatio = options.trimRatio ?? DEFAULT_TRIM_RATIO;
  const firstT = frames.reduce<number | null>((min, frame) => {
    if (frame.t == null) return min;
    return min == null ? frame.t : Math.min(min, frame.t);
  }, null);
  let candidates =
    firstT == null
      ? [...frames]
      : frames.filter((frame) => frame.t == null || (frame.t - firstT) * 1000 >= transientSkipMs);
  if (candidates.length < Math.min(2, frames.length)) candidates = [...frames];

  if (candidates.some((frame) => frame.rms != null) && candidates.length >= 4) {
    const byRms = [...candidates].sort((a, b) => (a.rms ?? 0) - (b.rms ?? 0));
    const trim = Math.floor(byRms.length * trimRatio);
    candidates = byRms.slice(trim, byRms.length - trim);
    if (candidates.length === 0) candidates = byRms;
  }

  let totalWeight = 0;
  for (const frame of candidates) {
    const rms = Math.max(0, frame.rms ?? 1);
    const weight = frame.rms == null ? 1 : Math.max(1e-5, rms * rms);
    totalWeight += weight;
    for (let i = 0; i < 12; i++)
      avgChroma[i] = (avgChroma[i] ?? 0) + (frame.chroma[i] ?? 0) * weight;
  }
  if (totalWeight <= 0)
    return { avgChroma, hasSignal: false, framesReceived: frames.length, framesUsed: 0 };
  for (let i = 0; i < 12; i++) avgChroma[i] = (avgChroma[i] ?? 0) / totalWeight;

  let norm = 0;
  for (let i = 0; i < 12; i++) norm += (avgChroma[i] ?? 0) * (avgChroma[i] ?? 0);
  norm = Math.sqrt(norm);
  if (norm <= 1e-8)
    return { avgChroma, hasSignal: false, framesReceived: frames.length, framesUsed: 0 };
  for (let i = 0; i < 12; i++) avgChroma[i] = (avgChroma[i] ?? 0) / norm;
  return {
    avgChroma,
    hasSignal: true,
    framesReceived: frames.length,
    framesUsed: candidates.length,
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

function confidenceFor(input: {
  accepted: boolean;
  rejected: boolean;
  expectedSimilarity: number;
  alternativeSimilarity: number;
  margin: number;
  threshold: ChordVerifierThreshold;
}): number {
  if (input.accepted) {
    const simHeadroom = input.expectedSimilarity - input.threshold.acceptSimilarity;
    const marginHeadroom = input.margin - input.threshold.acceptMargin;
    return clamp01(0.55 + simHeadroom * 1.2 + marginHeadroom * 2.5);
  }
  if (input.rejected) {
    const alternativeLead = input.alternativeSimilarity - input.expectedSimilarity;
    return clamp01(
      0.5 +
        (input.alternativeSimilarity - input.threshold.rejectAlternativeSimilarity) * 1.2 +
        (alternativeLead - input.threshold.rejectMargin) * 2,
    );
  }
  const similarityCloseness =
    input.threshold.acceptSimilarity <= 0
      ? 0
      : input.expectedSimilarity / input.threshold.acceptSimilarity;
  return clamp01(0.5 * similarityCloseness + Math.max(0, input.margin) * 0.5);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
