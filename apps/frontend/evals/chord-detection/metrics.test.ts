import { describe, expect, it } from "vitest";
import { computeMetrics } from "./metrics";
import type { ChordVerifierTrial, EvaluatedSampleResult } from "./types";

describe("computeMetrics", () => {
  it("separates top-1 accuracy from target-aware verifier recall", () => {
    const metrics = computeMetrics([
      result("one", "A", "A", "accepted", []),
      result("two", "D", "A", "uncertain", []),
      result("three", "G", null, "uncertain", []),
    ]);

    expect(metrics.summary.evaluated).toBe(3);
    expect(metrics.summary.accuracy).toBeCloseTo(1 / 3);
    expect(metrics.summary.verifierRecall).toBeCloseTo(1 / 3);
    expect(metrics.summary.falseRejectRate).toBeCloseTo(2 / 3);
    expect(metrics.summary.unknownRate).toBeCloseTo(2 / 3);
    expect(metrics.confusionMatrix.D?.A).toBe(1);
    expect(metrics.confusionMatrix.G?.unknown).toBe(1);
  });

  it("counts negative target-aware accepts as false accepts", () => {
    const metrics = computeMetrics([
      result("one", "A", "A", "accepted", [trial("D", "accepted"), trial("G", "uncertain")]),
      result("two", "D", "D", "accepted", [trial("A", "uncertain"), trial("G", "uncertain")]),
    ]);

    expect(metrics.summary.negativeTrials).toBe(4);
    expect(metrics.summary.falseAccepts).toBe(1);
    expect(metrics.summary.falseAcceptRate).toBeCloseTo(1 / 4);
    expect(metrics.summary.wrongAcceptedRate).toBeCloseTo(1 / 2);
  });
});

function result(
  sampleId: string,
  expectedChordId: string,
  predictedChordId: string | null,
  verifierStatus: EvaluatedSampleResult["verifierStatus"],
  negativeTrials: ChordVerifierTrial[],
): EvaluatedSampleResult {
  const acceptedChordId = verifierStatus === "accepted" ? expectedChordId : null;
  return {
    status: "evaluated",
    cacheStatus: "miss",
    datasetId: "isolated-guitar-chords",
    sampleId,
    expectedChordId,
    predictedChordId,
    similarity: predictedChordId == null ? 0 : 0.8,
    runnerUpChordId: null,
    runnerUpSimilarity: null,
    margin: 0.1,
    correct: predictedChordId === expectedChordId,
    sameFamily: false,
    verifierStatus,
    acceptedChordId,
    bestAlternativeChordId: null,
    expectedSimilarity: acceptedChordId == null ? 0.5 : 0.8,
    alternativeSimilarity: null,
    verifierMargin: 0.1,
    confidence: acceptedChordId == null ? 0.2 : 0.8,
    negativeTrials,
    capture: {
      chroma: Array(12).fill(0),
      hasSignal: predictedChordId != null,
      captureStartSec: 0,
      captureEndSec: 0.32,
      captureStrategy: "onset",
      onsetSec: 0,
      chromaFrames: 1,
      chromaFramesUsed: 1,
    },
    metadata: {},
  };
}

function trial(expectedChordId: string, status: ChordVerifierTrial["status"]): ChordVerifierTrial {
  return {
    status,
    expectedChordId,
    acceptedChordId: status === "accepted" ? expectedChordId : null,
    bestAlternativeChordId: null,
    expectedSimilarity: status === "accepted" ? 0.8 : 0.4,
    alternativeSimilarity: null,
    margin: 0.1,
    confidence: status === "accepted" ? 0.8 : 0.2,
  };
}
