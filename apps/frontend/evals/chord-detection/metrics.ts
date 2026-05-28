import { SUPPORTED_CHORD_ID_LIST } from "./label-map";
import type {
  EvaluatedSampleResult,
  MetricsReport,
  PerChordMetrics,
  SampleResult,
  ThresholdConfig,
} from "./types";

export const BASELINE_THRESHOLD: ThresholdConfig = { similarity: 0, margin: -1 };

export const THRESHOLD_SWEEP: ThresholdConfig[] = [
  BASELINE_THRESHOLD,
  { similarity: 0.55, margin: -1 },
  { similarity: 0.65, margin: 0 },
  { similarity: 0.75, margin: 0.03 },
  { similarity: 0.85, margin: 0.06 },
  { similarity: 0.9, margin: 0.1 },
];

export function computeMetrics(
  results: readonly SampleResult[],
  threshold: ThresholdConfig = BASELINE_THRESHOLD,
): MetricsReport {
  const evaluated = results.filter(
    (result): result is EvaluatedSampleResult => result.status === "evaluated",
  );
  const failed = results.length - evaluated.length;
  const perChord = new Map<string, MutableChordMetrics>();
  const confusionMatrix: Record<string, Record<string, number>> = {};
  let correct = 0;
  let acceptedCorrect = 0;
  let falseRejects = 0;
  let falseAccepts = 0;
  let unknowns = 0;

  for (const chordId of SUPPORTED_CHORD_ID_LIST) {
    perChord.set(chordId, { chordId, support: 0, predicted: 0, correct: 0 });
  }

  for (const result of evaluated) {
    const expected = result.expectedChordId;
    const predicted = result.predictedChordId ?? "unknown";
    confusionMatrix[expected] ??= {};
    confusionMatrix[expected][predicted] = (confusionMatrix[expected][predicted] ?? 0) + 1;
    const expectedMetrics = ensureChord(perChord, expected);
    expectedMetrics.support++;
    const accepted = isAccepted(result, threshold);
    if (!accepted) unknowns++;
    if (result.correct) correct++;
    if (accepted && result.predictedChordId) {
      const predictedMetrics = ensureChord(perChord, result.predictedChordId);
      predictedMetrics.predicted++;
      if (result.predictedChordId === expected) {
        expectedMetrics.correct++;
        acceptedCorrect++;
      } else {
        falseAccepts++;
      }
    }
    if (!accepted || result.predictedChordId !== expected) falseRejects++;
  }

  const evaluatedCount = evaluated.length;
  const negativeVerifierTrials = evaluatedCount * Math.max(0, SUPPORTED_CHORD_ID_LIST.length - 1);
  return {
    threshold,
    summary: {
      evaluated: evaluatedCount,
      failed,
      accuracy: safeDivide(correct, evaluatedCount),
      verifierRecall: safeDivide(acceptedCorrect, evaluatedCount),
      falseRejectRate: safeDivide(falseRejects, evaluatedCount),
      falseAcceptRate: safeDivide(falseAccepts, negativeVerifierTrials),
      wrongAcceptedRate: safeDivide(falseAccepts, evaluatedCount),
      unknownRate: safeDivide(unknowns, evaluatedCount),
    },
    perChord: [...perChord.values()]
      .filter((item) => item.support > 0 || item.predicted > 0)
      .map(toPerChordMetrics)
      .sort((a, b) => a.chordId.localeCompare(b.chordId)),
    confusionMatrix,
  };
}

export function computeThresholdSweep(results: readonly SampleResult[]): MetricsReport[] {
  return THRESHOLD_SWEEP.map((threshold) => computeMetrics(results, threshold));
}

function isAccepted(result: EvaluatedSampleResult, threshold: ThresholdConfig): boolean {
  return (
    result.predictedChordId != null &&
    result.similarity >= threshold.similarity &&
    result.margin >= threshold.margin
  );
}

interface MutableChordMetrics {
  chordId: string;
  support: number;
  predicted: number;
  correct: number;
}

function ensureChord(
  perChord: Map<string, MutableChordMetrics>,
  chordId: string,
): MutableChordMetrics {
  const existing = perChord.get(chordId);
  if (existing) return existing;
  const next = { chordId, support: 0, predicted: 0, correct: 0 };
  perChord.set(chordId, next);
  return next;
}

function toPerChordMetrics(item: MutableChordMetrics): PerChordMetrics {
  const precision = safeDivide(item.correct, item.predicted);
  const recall = safeDivide(item.correct, item.support);
  return {
    ...item,
    precision,
    recall,
    f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
  };
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}
