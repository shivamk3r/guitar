import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadDataset } from "./datasets";
import type { EvalCliOptions } from "./types";

let tempRoot: string;

describe("dataset adapters", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "chord-eval-datasets-"));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("loads isolated chord WAV files and filters unsupported labels", async () => {
    await writeFixtureFile("datasets/isolated-guitar-chords/data/Test/A/a.wav", "fake-audio");
    await writeFixtureFile(
      "datasets/isolated-guitar-chords/data/Test/A#/a-sharp.wav",
      "fake-audio",
    );

    const result = await loadDataset("isolated-guitar-chords", options());

    expect(result.samples).toHaveLength(1);
    expect(result.samples[0]?.expectedChordId).toBe("A");
    expect(result.skipped).toEqual([{ reason: "unsupported label", count: 1 }]);
  });

  it("loads GuitarSet comp chord intervals and reports skipped intervals", async () => {
    await writeFixtureFile(
      "datasets/guitarset/extracted/audio_mono-mic/00_Test-120-C_comp.wav",
      "fake-audio",
    );
    await writeFixtureFile(
      "datasets/guitarset/extracted/annotation/00_Test-120-C_comp.jams",
      JSON.stringify({
        annotations: [
          {
            namespace: "chord",
            data: [
              { time: 0, duration: 1, value: "C:maj" },
              { time: 1, duration: 1, value: "A#:maj" },
            ],
          },
          {
            namespace: "chord",
            data: [
              { time: 0, duration: 1, value: "C:maj/1" },
              { time: 1, duration: 1, value: "A#:maj/1" },
            ],
          },
        ],
      }),
    );
    await writeFixtureFile(
      "datasets/guitarset/extracted/annotation/00_Test-120-C_solo.jams",
      JSON.stringify({ annotations: [] }),
    );

    const result = await loadDataset("guitarset", options());

    expect(result.samples).toHaveLength(1);
    expect(result.samples[0]).toMatchObject({
      expectedChordId: "C",
      startSec: 0,
      endSec: 1,
    });
    expect(result.skipped).toEqual([
      { reason: "non-comp performance", count: 1 },
      { reason: "unsupported label", count: 1 },
    ]);
  });
});

function options(): EvalCliOptions {
  return {
    cacheRoot: tempRoot,
    datasets: ["isolated-guitar-chords", "guitarset"],
    force: false,
    refreshDatasets: false,
    prepareOnly: false,
    guitarSetMode: "comp",
    limit: null,
  };
}

async function writeFixtureFile(relativePath: string, contents: string): Promise<void> {
  const filePath = path.join(tempRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}
