import { type ChordVerifierResult, matchChord, verifyChord } from "../../src/audio/chord-detection";
import { CHORDS_BY_ID } from "../../src/data/chords";
import { analyzeChordCapture, decodeWavFile } from "./audio";
import { readCachedResult, writeCachedResult } from "./cache";
import { SUPPORTED_CHORD_ID_LIST } from "./label-map";
import type { EvalSample, SampleResult } from "./types";

export async function evaluateSamples(input: {
  samples: EvalSample[];
  cacheRoot: string;
  algorithmFingerprint: string;
  force: boolean;
}): Promise<SampleResult[]> {
  const results: SampleResult[] = [];
  let lastAudioPath: string | null = null;
  let lastAudio: Awaited<ReturnType<typeof decodeWavFile>> | null = null;

  for (const sample of input.samples) {
    if (!input.force) {
      const cached = await readCachedResult(input.cacheRoot, input.algorithmFingerprint, sample);
      if (cached) {
        results.push({ ...cached, cacheStatus: "hit" });
        continue;
      }
    }

    const result = await evaluateSample(sample, async () => {
      if (lastAudioPath !== sample.audioPath) {
        lastAudio = await decodeWavFile(sample.audioPath);
        lastAudioPath = sample.audioPath;
      }
      if (!lastAudio) throw new Error("audio decode failed");
      return lastAudio;
    });
    await writeCachedResult(input.cacheRoot, input.algorithmFingerprint, sample, result);
    results.push(result);
  }
  return results;
}

async function evaluateSample(
  sample: EvalSample,
  loadAudio: () => Promise<Awaited<ReturnType<typeof decodeWavFile>>>,
): Promise<SampleResult> {
  try {
    const audio = await loadAudio();
    const endSec =
      Number.isFinite(sample.endSec) && sample.endSec > sample.startSec
        ? sample.endSec
        : audio.samples.length / audio.sampleRate;
    const durationSec = Math.max(0, endSec - sample.startSec);
    const capture = analyzeChordCapture(audio, sample.startSec, endSec);
    const expected = CHORDS_BY_ID[sample.expectedChordId];
    if (!expected) throw new Error(`unknown expected chord: ${sample.expectedChordId}`);
    const capturedChroma = new Float32Array(capture.chroma);
    const match = capture.hasSignal ? matchChord(new Float32Array(capture.chroma), expected) : null;
    const verifier = capture.hasSignal
      ? verifyChord(capturedChroma, expected)
      : uncertainTrial(sample.expectedChordId);
    const negativeTrials = SUPPORTED_CHORD_ID_LIST.filter((chordId) => chordId !== expected.id).map(
      (chordId) => {
        const chord = CHORDS_BY_ID[chordId];
        if (!chord) throw new Error(`unknown negative chord: ${chordId}`);
        return capture.hasSignal ? verifyChord(capturedChroma, chord) : uncertainTrial(chordId);
      },
    );
    const predictedChordId = match?.chord?.id ?? null;
    const runnerUpChordId = match?.runnerUp?.chord.id ?? null;
    const runnerUpSimilarity = match?.runnerUp?.similarity ?? null;
    const similarity = match?.similarity ?? 0;
    const margin = runnerUpSimilarity == null ? similarity : similarity - runnerUpSimilarity;
    return {
      status: "evaluated",
      cacheStatus: "miss",
      datasetId: sample.datasetId,
      sampleId: sample.id,
      expectedChordId: sample.expectedChordId,
      evaluationStartSec: sample.startSec,
      evaluationEndSec: endSec,
      durationSec,
      predictedChordId,
      similarity,
      runnerUpChordId,
      runnerUpSimilarity,
      margin,
      correct: predictedChordId === sample.expectedChordId,
      sameFamily: match?.sameFamily ?? false,
      verifierStatus: verifier.status,
      acceptedChordId: verifier.acceptedChordId,
      bestAlternativeChordId: verifier.bestAlternativeChordId,
      expectedSimilarity: verifier.expectedSimilarity,
      alternativeSimilarity: verifier.alternativeSimilarity,
      verifierMargin: verifier.margin,
      confidence: verifier.confidence,
      negativeTrials,
      capture,
      metadata: sample.metadata,
    };
  } catch (err) {
    return {
      status: "failed",
      cacheStatus: "miss",
      datasetId: sample.datasetId,
      sampleId: sample.id,
      expectedChordId: sample.expectedChordId,
      reason: err instanceof Error ? err.message : String(err),
      metadata: sample.metadata,
    };
  }
}

function uncertainTrial(expectedChordId: string): ChordVerifierResult {
  return {
    status: "uncertain",
    expectedChordId,
    acceptedChordId: null,
    bestAlternativeChordId: null,
    expectedSimilarity: 0,
    alternativeSimilarity: null,
    margin: 0,
    confidence: 0,
  };
}
