import { describe, expect, it } from "vitest";
import { sampleResultCacheKey } from "./hash";
import type { EvalSample } from "./types";

describe("sampleResultCacheKey", () => {
  it("is stable and invalidates when segment timing changes", () => {
    const base = sample({ startSec: 0, endSec: 1 });
    const same = sample({ startSec: 0, endSec: 1 });
    const shifted = sample({ startSec: 0.5, endSec: 1.5 });

    expect(sampleResultCacheKey(base)).toBe(sampleResultCacheKey(same));
    expect(sampleResultCacheKey(base)).not.toBe(sampleResultCacheKey(shifted));
  });
});

function sample(input: { startSec: number; endSec: number }): EvalSample {
  return {
    id: "sample-1",
    datasetId: "isolated-guitar-chords",
    expectedChordId: "A",
    label: "A",
    audioPath: "/tmp/a.wav",
    sourcePath: "data/Test/A/a.wav",
    startSec: input.startSec,
    endSec: input.endSec,
    sampleFingerprint: "123:456",
    metadata: {},
  };
}
