import { matchChord } from "../../src/audio/chord-detection";
import { CHORDS_BY_ID } from "../../src/data/chords";
import { analyzeChordCapture, decodeWavFile } from "./audio";
import { readCachedResult, writeCachedResult } from "./cache";
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
    const capture = analyzeChordCapture(audio, sample.startSec, endSec);
    const expected = CHORDS_BY_ID[sample.expectedChordId];
    const match = capture.hasSignal ? matchChord(new Float32Array(capture.chroma), expected) : null;
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
      predictedChordId,
      similarity,
      runnerUpChordId,
      runnerUpSimilarity,
      margin,
      correct: predictedChordId === sample.expectedChordId,
      sameFamily: match?.sameFamily ?? false,
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
