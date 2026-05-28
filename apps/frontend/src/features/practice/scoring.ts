import { clamp } from "@/lib/math";

export type StringClass = "clean" | "dull" | "muted" | "wrong";

export interface ScoreInput {
  /** Detected chord id; undefined if nothing identifiable. */
  detectedChordId?: string;
  /** Expected chord id (what the student was asked to play). */
  expectedChordId?: string;
  /** Whether the detected chord shares the same root+family as expected (e.g., Cmaj7 vs C). */
  sameFamily?: boolean;
  /** Per-string classification, in low-to-high order, length 6. "muted" is implied when the
   *  expected fret is -1; supply "muted" in those slots so the function ignores them. */
  strings: readonly StringClass[];
  /** Timing delta from the target beat in ms. Omit for free-strum (defaults to 10). */
  timingDeltaMs?: number;
  /** Whether timing matters at all (false in free-strum mode). */
  timingApplies?: boolean;
  /** Whether a strum/onset was detected at all inside the target window. */
  strumDetected?: boolean;
  /** Expected string mask — which strings should ring? Length 6 low-to-high. */
  expectedRings: readonly boolean[];
}

export interface ScoredEvent {
  score: number;
  correctness: number;
  cleanliness: number;
  timing: number;
  weakComponent: "correctness" | "cleanliness" | "timing";
  cue: string;
}

function timingScore(deltaMs: number): number {
  const d = Math.abs(deltaMs);
  if (d <= 25) return 10;
  if (d <= 50) return 9;
  if (d <= 100) return 7;
  if (d <= 150) return 5;
  if (d <= 250) return 3;
  return 1;
}

export function scoreEvent(input: ScoreInput): ScoredEvent {
  const expectedRings = input.expectedRings;
  const expectedCount = expectedRings.filter(Boolean).length;

  // ---- Correctness (C) ----
  let correctness = 10;
  let correctnessCue = "";
  if (input.expectedChordId != null) {
    if (input.detectedChordId == null) {
      correctness = 0;
      correctnessCue = "no chord detected";
    } else if (input.detectedChordId === input.expectedChordId) {
      correctness = 10;
    } else if (input.sameFamily) {
      correctness = 7;
      correctnessCue = `heard ${input.detectedChordId}, asked ${input.expectedChordId}`;
    } else {
      correctness = 2;
      correctnessCue = `played ${input.detectedChordId} instead of ${input.expectedChordId}`;
    }
  }

  // ---- Cleanliness (L) ----
  let cleanness = 0;
  const dullCount: string[] = [];
  const mutedCount: string[] = [];
  const wrongCount: string[] = [];
  const stringNames = ["low E", "A", "D", "G", "B", "high E"];
  for (let i = 0; i < 6; i++) {
    if (!expectedRings[i]) continue;
    const s = input.strings[i] ?? "muted";
    if (s === "clean") cleanness += 1;
    else if (s === "dull") {
      cleanness += 0.5;
      dullCount.push(stringNames[i] ?? `str${i + 1}`);
    } else if (s === "muted") {
      mutedCount.push(stringNames[i] ?? `str${i + 1}`);
    } else if (s === "wrong") {
      wrongCount.push(stringNames[i] ?? `str${i + 1}`);
    }
  }
  const cleanliness = expectedCount > 0 ? (cleanness / expectedCount) * 10 : 10;
  let cleanlinessCue = "";
  if (mutedCount.length > 0) cleanlinessCue = `${mutedCount[0]} muted`;
  else if (dullCount.length > 0) cleanlinessCue = `${dullCount[0]} dull`;
  else if (wrongCount.length > 0) cleanlinessCue = `${wrongCount[0]} wrong pitch`;

  // ---- Timing (T) ----
  const timing = !input.timingApplies
    ? 10
    : input.strumDetected === false
      ? 0
      : timingScore(input.timingDeltaMs ?? 0);
  let timingCue = "";
  if (input.timingApplies && input.strumDetected !== false) {
    const d = input.timingDeltaMs ?? 0;
    if (Math.abs(d) > 50)
      timingCue =
        d > 0 ? `late by ${Math.abs(Math.round(d))} ms` : `early by ${Math.abs(Math.round(d))} ms`;
  } else if (input.timingApplies && input.strumDetected === false) {
    timingCue = "no strum detected";
  }

  // ---- Aggregate ----
  let raw = 0.2 * correctness + 0.5 * cleanliness + 0.3 * timing;

  // Wrong-chord cap: if detected chord clearly differs (and not same-family), cap at 3.
  if (
    input.expectedChordId != null &&
    input.detectedChordId != null &&
    input.detectedChordId !== input.expectedChordId &&
    !input.sameFamily
  ) {
    raw = Math.min(raw, 3);
  }

  const score = clamp(Math.round(raw), 1, 10);

  // Weakest component drives the cue
  const weights: Array<[ScoredEvent["weakComponent"], number, string]> = [
    ["correctness", correctness, correctnessCue],
    ["cleanliness", cleanliness, cleanlinessCue],
    ["timing", timing, timingCue],
  ];
  const weakest = weights.reduce((a, b) => (b[1] < a[1] ? b : a));
  const weakComponent = weakest[0];
  const cue = weakest[2] || "nice";

  return { score, correctness, cleanliness, timing, weakComponent, cue };
}

/** Compute the rolling average (last n events, default 8). Used as the drill's displayed score. */
export function rollingAverage(scores: readonly number[], n = 8): number {
  if (scores.length === 0) return 0;
  const slice = scores.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}
