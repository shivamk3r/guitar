import { CHORDS_BY_ID, type ChordDef, type ChordQuality } from "../../src/data/chords";
import {
  type EvaluatedSampleResult,
  WCSR_VARIANT_IDS,
  type WcsrMetrics,
  type WcsrVariantId,
  type WcsrVariantMetrics,
} from "./types";

const ROOT_TO_SEMITONE: Record<string, number> = {
  C: 0,
  "C#": 1,
  D: 2,
  "D#": 3,
  E: 4,
  F: 5,
  "F#": 6,
  G: 7,
  "G#": 8,
  A: 9,
  "A#": 10,
  B: 11,
};

const QUALITY_BITMAPS: Record<string, readonly number[]> = {
  maj: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
  min: [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
  aug: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  dim: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0],
  sus4: [1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0],
  sus2: [1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0],
  "7": [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  maj7: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1],
  min7: [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0],
  "5": [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
  "": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

const QUALITY_TO_HARTE: Record<ChordQuality, keyof typeof QUALITY_BITMAPS> = {
  major: "maj",
  minor: "min",
  dom7: "7",
  min7: "min7",
  power: "5",
  sus: "sus4",
};

const NO_CHORD_SYMBOL: ChordSymbol = {
  chordId: null,
  root: -1,
  semitones: [...qualityBitmap("")],
  bass: -1,
};

interface ChordSymbol {
  chordId: string | null;
  root: number;
  semitones: number[];
  bass: number;
}

interface WcsrAccumulator {
  correctDurationSec: number;
  validDurationSec: number;
  outOfGamutDurationSec: number;
}

export function computeDurationWeightedMetrics(results: readonly EvaluatedSampleResult[]): {
  totalDurationSec: number;
  verifierWeightedRecall: number;
  wcsr: WcsrMetrics;
} {
  const accumulators = emptyAccumulators();
  let totalDurationSec = 0;
  let verifierAcceptedDurationSec = 0;

  for (const result of results) {
    const durationSec = safeDuration(result.durationSec);
    totalDurationSec += durationSec;
    if (result.verifierStatus === "accepted") verifierAcceptedDurationSec += durationSec;

    for (const variant of WCSR_VARIANT_IDS) {
      const comparison = compareWcsrVariant(
        result.expectedChordId,
        result.predictedChordId,
        variant,
      );
      const accumulator = accumulators[variant];
      if (comparison < 0) {
        accumulator.outOfGamutDurationSec += durationSec;
      } else {
        accumulator.validDurationSec += durationSec;
        accumulator.correctDurationSec += comparison * durationSec;
      }
    }
  }

  return {
    totalDurationSec,
    verifierWeightedRecall: safeDivide(verifierAcceptedDurationSec, totalDurationSec),
    wcsr: finalizeAccumulators(accumulators),
  };
}

export function compareWcsrVariant(
  referenceChordId: string | null,
  estimatedChordId: string | null,
  variant: WcsrVariantId,
): number {
  if (variant === "exact") return referenceChordId === estimatedChordId ? 1 : 0;

  const reference = encodeChordSymbol(referenceChordId);
  const estimated = encodeChordSymbol(estimatedChordId);

  switch (variant) {
    case "root":
      return reference.root === estimated.root ? 1 : 0;
    case "mirex":
      return compareMirex(reference, estimated);
    case "thirds":
      return sameRoot(reference, estimated) && sameThird(reference, estimated) ? 1 : 0;
    case "thirdsInv":
      return sameRoot(reference, estimated) &&
        sameThird(reference, estimated) &&
        sameBass(reference, estimated)
        ? 1
        : 0;
    case "triads":
      return sameRoot(reference, estimated) && samePrefix(reference, estimated, 8) ? 1 : 0;
    case "triadsInv":
      return sameRoot(reference, estimated) &&
        samePrefix(reference, estimated, 8) &&
        sameBass(reference, estimated)
        ? 1
        : 0;
    case "tetrads":
      return sameRoot(reference, estimated) && sameSemitones(reference, estimated) ? 1 : 0;
    case "tetradsInv":
      return sameRoot(reference, estimated) &&
        sameSemitones(reference, estimated) &&
        sameBass(reference, estimated)
        ? 1
        : 0;
    case "majmin":
      return compareMajMin(reference, estimated, false);
    case "majminInv":
      return compareMajMin(reference, estimated, true);
    case "sevenths":
      return compareSevenths(reference, estimated, false);
    case "seventhsInv":
      return compareSevenths(reference, estimated, true);
  }
}

function emptyAccumulators(): Record<WcsrVariantId, WcsrAccumulator> {
  return Object.fromEntries(
    WCSR_VARIANT_IDS.map((variant) => [
      variant,
      { correctDurationSec: 0, validDurationSec: 0, outOfGamutDurationSec: 0 },
    ]),
  ) as Record<WcsrVariantId, WcsrAccumulator>;
}

function finalizeAccumulators(accumulators: Record<WcsrVariantId, WcsrAccumulator>): WcsrMetrics {
  return Object.fromEntries(
    WCSR_VARIANT_IDS.map((variant) => {
      const accumulator = accumulators[variant];
      return [
        variant,
        {
          score: safeDivide(accumulator.correctDurationSec, accumulator.validDurationSec),
          correctDurationSec: accumulator.correctDurationSec,
          validDurationSec: accumulator.validDurationSec,
          outOfGamutDurationSec: accumulator.outOfGamutDurationSec,
        } satisfies WcsrVariantMetrics,
      ];
    }),
  ) as WcsrMetrics;
}

function encodeChordSymbol(chordId: string | null): ChordSymbol {
  if (chordId == null) return NO_CHORD_SYMBOL;
  const chord = CHORDS_BY_ID[chordId];
  if (!chord) throw new Error(`unknown chord id for WCSR: ${chordId}`);
  return encodeChord(chord);
}

function encodeChord(chord: ChordDef): ChordSymbol {
  const root = ROOT_TO_SEMITONE[chord.root];
  if (root == null) throw new Error(`unsupported chord root for WCSR: ${chord.root}`);
  const quality = QUALITY_TO_HARTE[chord.quality];
  const semitones = qualityBitmap(quality);
  return {
    chordId: chord.id,
    root,
    semitones: [...semitones],
    bass: 0,
  };
}

function compareMirex(reference: ChordSymbol, estimated: ChordSymbol): number {
  const referenceSemitoneCount = activeCount(reference.semitones);
  if (referenceSemitoneCount > 0 && referenceSemitoneCount < 3) return -1;
  if (isNoChord(reference) && isNoChord(estimated)) return 1;
  return absoluteIntersectionCount(reference, estimated) >= 3 ? 1 : 0;
}

function compareMajMin(
  reference: ChordSymbol,
  estimated: ChordSymbol,
  includeBass: boolean,
): number {
  if (!isMajMinReference(reference)) return -1;
  if (includeBass && !validReferenceInversion(reference)) return -1;
  return sameRoot(reference, estimated) &&
    samePrefix(reference, estimated, 8) &&
    (!includeBass || sameBass(reference, estimated))
    ? 1
    : 0;
}

function compareSevenths(
  reference: ChordSymbol,
  estimated: ChordSymbol,
  includeBass: boolean,
): number {
  if (!isSeventhsReference(reference)) return -1;
  if (includeBass && !validReferenceInversion(reference)) return -1;
  return sameRoot(reference, estimated) &&
    sameSemitones(reference, estimated) &&
    (!includeBass || sameBass(reference, estimated))
    ? 1
    : 0;
}

function isMajMinReference(chord: ChordSymbol): boolean {
  return (
    isNoChord(chord) ||
    arraysEqualPrefix(chord.semitones, qualityBitmap("maj"), 8) ||
    arraysEqualPrefix(chord.semitones, qualityBitmap("min"), 8)
  );
}

function isSeventhsReference(chord: ChordSymbol): boolean {
  return ["maj", "min", "maj7", "7", "min7", ""].some((quality) =>
    arraysEqual(chord.semitones, qualityBitmap(quality)),
  );
}

function qualityBitmap(quality: string): readonly number[] {
  const semitones = QUALITY_BITMAPS[quality];
  if (!semitones) throw new Error(`unsupported Harte quality for WCSR: ${quality}`);
  return semitones;
}

function validReferenceInversion(chord: ChordSymbol): boolean {
  return chord.bass < 0 || chord.semitones[chord.bass] === 1;
}

function sameRoot(reference: ChordSymbol, estimated: ChordSymbol): boolean {
  return reference.root === estimated.root;
}

function sameBass(reference: ChordSymbol, estimated: ChordSymbol): boolean {
  return reference.bass === estimated.bass;
}

function sameThird(reference: ChordSymbol, estimated: ChordSymbol): boolean {
  return reference.semitones[3] === estimated.semitones[3];
}

function samePrefix(reference: ChordSymbol, estimated: ChordSymbol, length: number): boolean {
  return arraysEqualPrefix(reference.semitones, estimated.semitones, length);
}

function sameSemitones(reference: ChordSymbol, estimated: ChordSymbol): boolean {
  return arraysEqual(reference.semitones, estimated.semitones);
}

function absoluteIntersectionCount(reference: ChordSymbol, estimated: ChordSymbol): number {
  const referenceAbsolute = rotateToRoot(reference.semitones, reference.root);
  const estimatedAbsolute = rotateToRoot(estimated.semitones, estimated.root);
  let intersection = 0;
  for (let i = 0; i < 12; i++) {
    if ((referenceAbsolute[i] ?? 0) > 0 && (estimatedAbsolute[i] ?? 0) > 0) intersection++;
  }
  return intersection;
}

function rotateToRoot(semitones: readonly number[], root: number): number[] {
  const out = Array(12).fill(0) as number[];
  for (let i = 0; i < 12; i++) {
    if ((semitones[i] ?? 0) > 0) out[(((i + root) % 12) + 12) % 12] = 1;
  }
  return out;
}

function isNoChord(chord: ChordSymbol): boolean {
  return chord.root < 0 && activeCount(chord.semitones) === 0;
}

function activeCount(semitones: readonly number[]): number {
  return semitones.filter((value) => value > 0).length;
}

function arraysEqualPrefix(
  left: readonly number[],
  right: readonly number[],
  length: number,
): boolean {
  for (let i = 0; i < length; i++) {
    if ((left[i] ?? 0) !== (right[i] ?? 0)) return false;
  }
  return true;
}

function arraysEqual(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;
  return arraysEqualPrefix(left, right, left.length);
}

function safeDuration(durationSec: number): number {
  return Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}
