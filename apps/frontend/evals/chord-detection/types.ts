import type { ChordVerifierStatus } from "../../src/audio/chord-detection";

export const EVAL_VERSION = "chord-detection-eval-v3-wcsr";

export const CAPTURE_CONFIG = {
  fftSize: 2048,
  hopSize: 512,
  captureMs: 320,
  minHz: 70,
  maxHz: 2000,
  rmsThreshold: 0.01,
  onsetLookbackMs: 500,
  transientSkipMs: 80,
  trimRatio: 0.15,
} as const;

export type DatasetId = "isolated-guitar-chords" | "guitarset";

export interface EvalCliOptions {
  cacheRoot: string;
  datasets: DatasetId[];
  force: boolean;
  refreshDatasets: boolean;
  prepareOnly: boolean;
  guitarSetMode: "comp" | "all";
  limit: number | null;
}

export interface DatasetSkip {
  reason: string;
  count: number;
}

export interface DatasetLoadResult {
  datasetId: DatasetId;
  samples: EvalSample[];
  skipped: DatasetSkip[];
}

export interface EvalSample {
  id: string;
  datasetId: DatasetId;
  expectedChordId: string;
  label: string;
  audioPath: string;
  sourcePath: string;
  startSec: number;
  endSec: number;
  sampleFingerprint: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface CaptureResult {
  chroma: number[];
  hasSignal: boolean;
  captureStartSec: number;
  captureEndSec: number;
  captureStrategy: "onset" | "midpoint" | "fallback";
  onsetSec: number | null;
  chromaFrames: number;
  chromaFramesUsed: number;
}

export interface ChordVerifierTrial {
  status: ChordVerifierStatus;
  expectedChordId: string;
  acceptedChordId: string | null;
  bestAlternativeChordId: string | null;
  expectedSimilarity: number;
  alternativeSimilarity: number | null;
  margin: number;
  confidence: number;
}

export interface EvaluatedSampleResult {
  status: "evaluated";
  cacheStatus: "hit" | "miss";
  datasetId: DatasetId;
  sampleId: string;
  expectedChordId: string;
  evaluationStartSec: number;
  evaluationEndSec: number;
  durationSec: number;
  predictedChordId: string | null;
  similarity: number;
  runnerUpChordId: string | null;
  runnerUpSimilarity: number | null;
  margin: number;
  correct: boolean;
  sameFamily: boolean;
  verifierStatus: ChordVerifierStatus;
  acceptedChordId: string | null;
  bestAlternativeChordId: string | null;
  expectedSimilarity: number;
  alternativeSimilarity: number | null;
  verifierMargin: number;
  confidence: number;
  negativeTrials: ChordVerifierTrial[];
  capture: CaptureResult;
  metadata: EvalSample["metadata"];
}

export interface FailedSampleResult {
  status: "failed";
  cacheStatus: "hit" | "miss";
  datasetId: DatasetId;
  sampleId: string;
  expectedChordId: string;
  reason: string;
  metadata: EvalSample["metadata"];
}

export type SampleResult = EvaluatedSampleResult | FailedSampleResult;

export interface PerChordMetrics {
  chordId: string;
  support: number;
  predicted: number;
  correct: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface MetricsSummary {
  evaluated: number;
  failed: number;
  totalDurationSec: number;
  negativeTrials: number;
  falseAccepts: number;
  wrongAcceptedSamples: number;
  accuracy: number;
  verifierRecall: number;
  verifierWeightedRecall: number;
  falseRejectRate: number;
  falseAcceptRate: number;
  wrongAcceptedRate: number;
  unknownRate: number;
  rejectedRate: number;
  wcsr: WcsrMetrics;
}

export interface MetricsReport {
  summary: MetricsSummary;
  perChord: PerChordMetrics[];
  confusionMatrix: Record<string, Record<string, number>>;
}

export const WCSR_VARIANT_IDS = [
  "exact",
  "root",
  "mirex",
  "thirds",
  "thirdsInv",
  "triads",
  "triadsInv",
  "tetrads",
  "tetradsInv",
  "majmin",
  "majminInv",
  "sevenths",
  "seventhsInv",
] as const;

export type WcsrVariantId = (typeof WCSR_VARIANT_IDS)[number];

export interface WcsrVariantMetrics {
  score: number;
  correctDurationSec: number;
  validDurationSec: number;
  outOfGamutDurationSec: number;
}

export type WcsrMetrics = Record<WcsrVariantId, WcsrVariantMetrics>;

export interface EvalReport {
  implementation: "frontend" | "python";
  generatedAtIso: string;
  evalVersion: string;
  algorithmFingerprint: string;
  options: {
    datasets: DatasetId[];
    limit: number | null;
    guitarSetMode: "comp" | "all";
  };
  datasetSkips: Record<DatasetId, DatasetSkip[]>;
  cache: {
    hits: number;
    misses: number;
  };
  summary: MetricsReport;
  byDataset: Record<DatasetId, MetricsReport | null>;
  samples: SampleResult[];
}
