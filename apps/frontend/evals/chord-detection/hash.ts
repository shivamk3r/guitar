import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CAPTURE_CONFIG, EVAL_VERSION, type EvalSample } from "./types";

const DETECTOR_SOURCE_FILES = [
  "src/audio/chord-detection.ts",
  "src/audio/dsp/chroma.ts",
  "src/audio/dsp/fft.ts",
  "src/audio/dsp/onset.ts",
  "src/data/chords.ts",
  "src/data/tunings.ts",
  "src/lib/math.ts",
] as const;

export async function algorithmFingerprint(frontendRoot: string): Promise<string> {
  const hash = createHash("sha256");
  hash.update(EVAL_VERSION);
  hash.update(JSON.stringify(CAPTURE_CONFIG));
  for (const relativePath of DETECTOR_SOURCE_FILES) {
    hash.update(relativePath);
    hash.update(await readFile(path.join(frontendRoot, relativePath)));
  }
  return hash.digest("hex").slice(0, 16);
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function sampleResultCacheKey(sample: EvalSample): string {
  return stableHash({
    datasetId: sample.datasetId,
    id: sample.id,
    expectedChordId: sample.expectedChordId,
    sourcePath: sample.sourcePath,
    startSec: sample.startSec,
    endSec: sample.endSec,
    sampleFingerprint: sample.sampleFingerprint,
  }).slice(0, 32);
}

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
