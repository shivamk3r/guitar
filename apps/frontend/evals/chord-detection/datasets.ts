import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import {
  downloadFile,
  encodeUrlPath,
  ensureDir,
  exists,
  fileStatFingerprint,
  listFiles,
  removeDir,
} from "./fs-utils";
import { normalizeChordLabel } from "./label-map";
import type {
  DatasetId,
  DatasetLoadResult,
  DatasetSkip,
  EvalCliOptions,
  EvalSample,
} from "./types";

const require = createRequire(import.meta.url);
const extractZip = require("extract-zip") as typeof import("extract-zip");

const HF_DATASET = "severyn-k/isolated-guitar-chords";
const HF_SPLIT_ROOT = "data/Test";
const GUITARSET_RECORD_API = "https://zenodo.org/api/records/3371780";
const GUITARSET_FILE_KEYS = ["annotation.zip", "audio_mono-mic.zip"] as const;

interface HuggingFaceTreeItem {
  path: string;
  type: "file" | "directory";
  size?: number;
}

interface ZenodoRecord {
  files: Array<{ key: string; size: number; links: { self: string } }>;
}

interface GuitarSetJams {
  annotations: Array<{
    namespace: string;
    data: Array<{ time: number; duration: number; value: string }>;
  }>;
}

export async function prepareDatasets(options: EvalCliOptions): Promise<void> {
  for (const datasetId of options.datasets) {
    if (datasetId === "isolated-guitar-chords") await prepareIsolatedDataset(options);
    if (datasetId === "guitarset") await prepareGuitarSet(options);
  }
}

export async function loadDataset(
  datasetId: DatasetId,
  options: EvalCliOptions,
): Promise<DatasetLoadResult> {
  if (datasetId === "isolated-guitar-chords") return loadIsolatedDataset(options);
  return loadGuitarSet(options);
}

async function prepareIsolatedDataset(options: EvalCliOptions): Promise<void> {
  const root = isolatedRoot(options.cacheRoot);
  if (options.refreshDatasets) await removeDir(root);
  await ensureDir(root);
  const apiUrl = `https://huggingface.co/api/datasets/${HF_DATASET}/tree/main/${HF_SPLIT_ROOT}?recursive=1`;
  const items = (await fetchJson(apiUrl)) as HuggingFaceTreeItem[];
  const files = items.filter((item) => item.type === "file" && item.path.endsWith(".wav"));
  let downloaded = 0;
  for (const item of files) {
    const label = item.path.split("/").at(-2) ?? "";
    if (!normalizeChordLabel(label)) continue;
    const target = path.join(root, item.path);
    const url = `https://huggingface.co/datasets/${HF_DATASET}/resolve/main/${encodeUrlPath(item.path)}`;
    await downloadFile(url, target, options.refreshDatasets);
    downloaded++;
  }
  await writeJson(path.join(root, "manifest.json"), {
    datasetId: "isolated-guitar-chords",
    source: `https://huggingface.co/datasets/${HF_DATASET}`,
    split: "Test",
    downloaded,
  });
}

async function prepareGuitarSet(options: EvalCliOptions): Promise<void> {
  const root = guitarSetRoot(options.cacheRoot);
  if (options.refreshDatasets) await removeDir(root);
  await ensureDir(root);
  const record = (await fetchJson(GUITARSET_RECORD_API)) as ZenodoRecord;
  const archivesDir = path.join(root, "archives");
  const extractedDir = path.join(root, "extracted");
  await ensureDir(archivesDir);
  for (const key of GUITARSET_FILE_KEYS) {
    const file = record.files.find((item) => item.key === key);
    if (!file) throw new Error(`GuitarSet Zenodo file missing: ${key}`);
    const archivePath = path.join(archivesDir, key);
    await downloadFile(file.links.self, archivePath, options.refreshDatasets);
    const extractTarget = path.join(extractedDir, key.replace(/\.zip$/, ""));
    const marker = path.join(extractTarget, ".extracted");
    if (options.refreshDatasets || !(await exists(marker))) {
      await removeDir(extractTarget);
      await ensureDir(extractTarget);
      await extractZip(archivePath, { dir: extractTarget });
      await writeFile(marker, new Date().toISOString());
    }
  }
  await writeJson(path.join(root, "manifest.json"), {
    datasetId: "guitarset",
    source: "https://zenodo.org/records/3371780",
    files: GUITARSET_FILE_KEYS,
  });
}

async function loadIsolatedDataset(options: EvalCliOptions): Promise<DatasetLoadResult> {
  const root = isolatedRoot(options.cacheRoot);
  const files = await listFiles(path.join(root, HF_SPLIT_ROOT), (filePath) =>
    filePath.toLowerCase().endsWith(".wav"),
  );
  const skipped = new Map<string, number>();
  const samples: EvalSample[] = [];
  for (const filePath of files) {
    const label = path.basename(path.dirname(filePath));
    const expectedChordId = normalizeChordLabel(label);
    if (!expectedChordId) {
      increment(skipped, "unsupported label");
      continue;
    }
    const relative = path.relative(root, filePath);
    samples.push({
      id: `isolated:${relative}`,
      datasetId: "isolated-guitar-chords",
      expectedChordId,
      label,
      audioPath: filePath,
      sourcePath: relative,
      startSec: 0,
      endSec: Number.POSITIVE_INFINITY,
      sampleFingerprint: await fileStatFingerprint(filePath),
      metadata: { split: "Test" },
    });
  }
  return { datasetId: "isolated-guitar-chords", samples, skipped: toSkips(skipped) };
}

async function loadGuitarSet(options: EvalCliOptions): Promise<DatasetLoadResult> {
  const root = guitarSetRoot(options.cacheRoot);
  const annotationRoot = path.join(root, "extracted", "annotation.zip".replace(/\.zip$/, ""));
  const audioRoot = path.join(root, "extracted", "audio_mono-mic.zip".replace(/\.zip$/, ""));
  const jamsFiles = await listFiles(annotationRoot, (filePath) => filePath.endsWith(".jams"));
  const audioFiles = await listFiles(audioRoot, (filePath) =>
    filePath.toLowerCase().endsWith(".wav"),
  );
  const audioByBase = indexAudioByJamsBase(audioFiles);
  const skipped = new Map<string, number>();
  const samples: EvalSample[] = [];

  for (const jamsPath of jamsFiles) {
    const base = path.basename(jamsPath, ".jams");
    if (options.guitarSetMode === "comp" && !base.endsWith("_comp")) {
      increment(skipped, "non-comp performance");
      continue;
    }
    const audioPath = audioByBase.get(base);
    if (!audioPath) {
      increment(skipped, "missing mono-mic audio");
      continue;
    }
    const jams = JSON.parse(await readFile(jamsPath, "utf8")) as GuitarSetJams;
    const simpleChordAnnotation = jams.annotations.filter(
      (annotation) => annotation.namespace === "chord",
    )[0];
    const performedChordAnnotation = jams.annotations.filter(
      (annotation) => annotation.namespace === "chord",
    )[1];
    if (!simpleChordAnnotation) {
      increment(skipped, "missing chord annotation");
      continue;
    }
    const audioFingerprint = await fileStatFingerprint(audioPath);
    for (let i = 0; i < simpleChordAnnotation.data.length; i++) {
      const simple = simpleChordAnnotation.data[i];
      if (!simple || simple.duration < 0.25) {
        increment(skipped, "too-short chord segment");
        continue;
      }
      const performed = performedChordAnnotation?.data[i];
      const expectedChordId =
        (performed ? normalizeChordLabel(performed.value) : null) ??
        normalizeChordLabel(simple.value);
      if (!expectedChordId) {
        increment(skipped, "unsupported label");
        continue;
      }
      const sourcePath = path.relative(root, jamsPath);
      const startSec = simple.time;
      const endSec = simple.time + simple.duration;
      samples.push({
        id: `guitarset:${base}:${i}:${startSec.toFixed(3)}:${endSec.toFixed(3)}:${expectedChordId}`,
        datasetId: "guitarset",
        expectedChordId,
        label: performed?.value ?? simple.value,
        audioPath,
        sourcePath,
        startSec,
        endSec,
        sampleFingerprint: `${audioFingerprint}:${sourcePath}:${i}:${simple.value}:${performed?.value ?? ""}`,
        metadata: {
          performance: base,
          chordIndex: i,
          simpleLabel: simple.value,
          performedLabel: performed?.value ?? null,
          mode: options.guitarSetMode,
        },
      });
    }
  }
  return { datasetId: "guitarset", samples, skipped: toSkips(skipped) };
}

function isolatedRoot(cacheRoot: string): string {
  return path.join(cacheRoot, "datasets", "isolated-guitar-chords");
}

function guitarSetRoot(cacheRoot: string): string {
  return path.join(cacheRoot, "datasets", "guitarset");
}

function indexAudioByJamsBase(audioFiles: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const audioPath of audioFiles) {
    const base = path.basename(audioPath, path.extname(audioPath));
    out.set(base, audioPath);
    out.set(base.replace(/_mic$/, ""), audioPath);
    out.set(base.replace(/_mono-mic$/, ""), audioPath);
  }
  return out;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`request failed ${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function increment(map: Map<string, number>, reason: string): void {
  map.set(reason, (map.get(reason) ?? 0) + 1);
}

function toSkips(map: Map<string, number>): DatasetSkip[] {
  return [...map.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => a.reason.localeCompare(b.reason));
}
