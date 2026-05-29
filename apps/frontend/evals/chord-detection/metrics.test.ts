import { describe, expect, it } from "vitest";
import { computeMetrics } from "./metrics";
import type { ChordVerifierTrial, EvaluatedSampleResult } from "./types";
import { compareWcsrVariant } from "./wcsr";

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
    expect(metrics.summary.wcsr.exact.score).toBeCloseTo(1 / 3);
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

  it("duration-weights WCSR and verifier recall", () => {
    const metrics = computeMetrics([
      result("long", "A", "A", "accepted", [], 9),
      result("short", "D", "A", "rejected", [], 1),
    ]);

    expect(metrics.summary.accuracy).toBeCloseTo(1 / 2);
    expect(metrics.summary.verifierRecall).toBeCloseTo(1 / 2);
    expect(metrics.summary.totalDurationSec).toBeCloseTo(10);
    expect(metrics.summary.wcsr.exact.score).toBeCloseTo(0.9);
    expect(metrics.summary.verifierWeightedRecall).toBeCloseTo(0.9);
  });

  it("excludes out-of-gamut reference duration per WCSR variant", () => {
    const metrics = computeMetrics([
      result("power", "E5", "E5", "accepted", [], 2),
      result("major", "A", "A", "accepted", [], 3),
    ]);

    expect(metrics.summary.wcsr.exact.score).toBe(1);
    expect(metrics.summary.wcsr.majmin.score).toBe(1);
    expect(metrics.summary.wcsr.majmin.validDurationSec).toBeCloseTo(3);
    expect(metrics.summary.wcsr.majmin.outOfGamutDurationSec).toBeCloseTo(2);
    expect(metrics.summary.wcsr.mirex.outOfGamutDurationSec).toBeCloseTo(2);
  });

  it("compares representative MIR chord vocabularies", () => {
    expect(compareWcsrVariant("A7", "Am", "root")).toBe(1);
    expect(compareWcsrVariant("A7", "A", "thirds")).toBe(1);
    expect(compareWcsrVariant("A7", "A", "triads")).toBe(1);
    expect(compareWcsrVariant("A7", "A", "tetrads")).toBe(0);
    expect(compareWcsrVariant("A7", "A7", "sevenths")).toBe(1);
    expect(compareWcsrVariant("E5", "E", "mirex")).toBe(-1);
  });
});

function result(
  sampleId: string,
  expectedChordId: string,
  predictedChordId: string | null,
  verifierStatus: EvaluatedSampleResult["verifierStatus"],
  negativeTrials: ChordVerifierTrial[],
  durationSec = 1,
): EvaluatedSampleResult {
  const acceptedChordId = verifierStatus === "accepted" ? expectedChordId : null;
  return {
    status: "evaluated",
    cacheStatus: "miss",
    datasetId: "isolated-guitar-chords",
    sampleId,
    expectedChordId,
    evaluationStartSec: 0,
    evaluationEndSec: durationSec,
    durationSec,
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
