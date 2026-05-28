import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureDir, exists } from "./fs-utils";
import { sampleResultCacheKey } from "./hash";
import type { EvalSample, SampleResult } from "./types";

export async function readCachedResult(
  cacheRoot: string,
  algorithmFingerprint: string,
  sample: EvalSample,
): Promise<SampleResult | null> {
  const filePath = resultCachePath(cacheRoot, algorithmFingerprint, sample);
  if (!(await exists(filePath))) return null;
  return JSON.parse(await readFile(filePath, "utf8")) as SampleResult;
}

export async function writeCachedResult(
  cacheRoot: string,
  algorithmFingerprint: string,
  sample: EvalSample,
  result: SampleResult,
): Promise<void> {
  const filePath = resultCachePath(cacheRoot, algorithmFingerprint, sample);
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(result, null, 2)}\n`);
}

function resultCachePath(
  cacheRoot: string,
  algorithmFingerprint: string,
  sample: EvalSample,
): string {
  return path.join(
    cacheRoot,
    "results",
    algorithmFingerprint,
    sample.datasetId,
    `${sampleResultCacheKey(sample)}.json`,
  );
}
