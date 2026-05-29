import { SUPPORTED_CHORD_ID_LIST } from "./label-map";
import type {
  ChordVerifierTrial,
  EvaluatedSampleResult,
  MetricsReport,
  PerChordMetrics,
  SampleResult,
} from "./types";
import { computeDurationWeightedMetrics } from "./wcsr";

export function computeMetrics(results: readonly SampleResult[]): MetricsReport {
  const evaluated = results.filter(
    (result): result is EvaluatedSampleResult => result.status === "evaluated",
  );
  const failed = results.length - evaluated.length;
  const perChord = new Map<string, MutableChordMetrics>();
  const confusionMatrix: Record<string, Record<string, number>> = {};
  let topOneCorrect = 0;
  let positiveAccepted = 0;
  let positiveRejected = 0;
  let positiveUncertain = 0;
  let negativeTrials = 0;
  let falseAccepts = 0;
  let wrongAcceptedSamples = 0;

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
    if (result.correct) topOneCorrect++;

    if (result.verifierStatus === "accepted") {
      positiveAccepted++;
      expectedMetrics.correct++;
      expectedMetrics.predicted++;
    } else if (result.verifierStatus === "rejected") {
      positiveRejected++;
    } else {
      positiveUncertain++;
    }

    const acceptedNegatives = result.negativeTrials.filter(isAccepted);
    negativeTrials += result.negativeTrials.length;
    falseAccepts += acceptedNegatives.length;
    if (acceptedNegatives.length > 0) wrongAcceptedSamples++;
    for (const trial of acceptedNegatives) {
      ensureChord(perChord, trial.expectedChordId).predicted++;
    }
  }

  const evaluatedCount = evaluated.length;
  const weighted = computeDurationWeightedMetrics(evaluated);
  return {
    summary: {
      evaluated: evaluatedCount,
      failed,
      totalDurationSec: weighted.totalDurationSec,
      negativeTrials,
      falseAccepts,
      wrongAcceptedSamples,
      accuracy: safeDivide(topOneCorrect, evaluatedCount),
      verifierRecall: safeDivide(positiveAccepted, evaluatedCount),
      verifierWeightedRecall: weighted.verifierWeightedRecall,
      falseRejectRate: safeDivide(evaluatedCount - positiveAccepted, evaluatedCount),
      falseAcceptRate: safeDivide(falseAccepts, negativeTrials),
      wrongAcceptedRate: safeDivide(wrongAcceptedSamples, evaluatedCount),
      unknownRate: safeDivide(positiveUncertain, evaluatedCount),
      rejectedRate: safeDivide(positiveRejected, evaluatedCount),
      wcsr: weighted.wcsr,
    },
    perChord: [...perChord.values()]
      .filter((item) => item.support > 0 || item.predicted > 0)
      .map(toPerChordMetrics)
      .sort((a, b) => a.chordId.localeCompare(b.chordId)),
    confusionMatrix,
  };
}

function isAccepted(trial: ChordVerifierTrial): boolean {
  return trial.status === "accepted";
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
