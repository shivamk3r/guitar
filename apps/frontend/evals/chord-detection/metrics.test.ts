import { describe, expect, it } from "vitest";
import { computeMetrics } from "./metrics";
import type { EvaluatedSampleResult } from "./types";

describe("computeMetrics", () => {
  it("reports accuracy, recall, and wrong accepted rate for baseline top-1 behavior", () => {
    const metrics = computeMetrics([
      result("one", "A", "A", 0.9),
      result("two", "D", "A", 0.8),
      result("three", "G", null, 0),
    ]);

    expect(metrics.summary.evaluated).toBe(3);
    expect(metrics.summary.accuracy).toBeCloseTo(1 / 3);
    expect(metrics.summary.verifierRecall).toBeCloseTo(1 / 3);
    expect(metrics.summary.falseRejectRate).toBeCloseTo(2 / 3);
    expect(metrics.summary.wrongAcceptedRate).toBeCloseTo(1 / 3);
    expect(metrics.confusionMatrix.D?.A).toBe(1);
    expect(metrics.confusionMatrix.G?.unknown).toBe(1);
  });

  it("applies similarity and margin thresholds as rejects", () => {
    const metrics = computeMetrics(
      [result("one", "A", "A", 0.7, 0.02), result("two", "D", "D", 0.9, 0.2)],
      { similarity: 0.8, margin: 0.05 },
    );

    expect(metrics.summary.verifierRecall).toBeCloseTo(1 / 2);
    expect(metrics.summary.unknownRate).toBeCloseTo(1 / 2);
  });
});

function result(
  sampleId: string,
  expectedChordId: string,
  predictedChordId: string | null,
  similarity: number,
  margin = 0.1,
): EvaluatedSampleResult {
  return {
    status: "evaluated",
    cacheStatus: "miss",
    datasetId: "isolated-guitar-chords",
    sampleId,
    expectedChordId,
    predictedChordId,
    similarity,
    runnerUpChordId: null,
    runnerUpSimilarity: null,
    margin,
    correct: predictedChordId === expectedChordId,
    sameFamily: false,
    capture: {
      chroma: Array(12).fill(0),
      hasSignal: predictedChordId != null,
      captureStartSec: 0,
      captureEndSec: 0.32,
      captureStrategy: "onset",
      onsetSec: 0,
      chromaFrames: 1,
    },
    metadata: {},
  };
}
