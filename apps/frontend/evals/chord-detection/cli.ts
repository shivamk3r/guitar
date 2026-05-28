import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDataset, prepareDatasets } from "./datasets";
import { evaluateSamples } from "./evaluator";
import { ensureDir } from "./fs-utils";
import { algorithmFingerprint } from "./hash";
import { computeMetrics } from "./metrics";
import { writeReports } from "./report";
import type { DatasetId, EvalCliOptions, EvalReport, SampleResult } from "./types";
import { EVAL_VERSION } from "./types";

const DATASET_IDS = ["isolated-guitar-chords", "guitarset"] as const satisfies readonly DatasetId[];

async function main(): Promise<void> {
  const paths = resolvePaths();
  const options = parseArgs(process.argv.slice(2), paths.cacheRoot);
  await ensureDir(options.cacheRoot);
  await prepareDatasets(options);
  if (options.prepareOnly) {
    console.log(`Prepared chord eval datasets in ${options.cacheRoot}`);
    return;
  }

  const fingerprint = await algorithmFingerprint(paths.frontendRoot);
  const datasetLoads = [];
  for (const datasetId of options.datasets)
    datasetLoads.push(await loadDataset(datasetId, options));
  const allSamples = datasetLoads.flatMap((load) => load.samples);
  const samples = options.limit == null ? allSamples : allSamples.slice(0, options.limit);
  console.log(
    `Running ${samples.length}/${allSamples.length} chord eval samples with algorithm ${fingerprint}`,
  );

  const results = await evaluateSamples({
    samples,
    cacheRoot: options.cacheRoot,
    algorithmFingerprint: fingerprint,
    force: options.force,
  });
  const report = buildReport({ options, fingerprint, datasetLoads, results });
  const written = await writeReports(options.cacheRoot, report);
  printSummary(report, written.markdownPath);
}

function buildReport(input: {
  options: EvalCliOptions;
  fingerprint: string;
  datasetLoads: Awaited<ReturnType<typeof loadDataset>>[];
  results: SampleResult[];
}): EvalReport {
  const datasetSkips = Object.fromEntries(
    DATASET_IDS.map((datasetId) => [
      datasetId,
      input.datasetLoads.find((load) => load.datasetId === datasetId)?.skipped ?? [],
    ]),
  ) as EvalReport["datasetSkips"];
  const byDataset = Object.fromEntries(
    DATASET_IDS.map((datasetId) => {
      const datasetResults = input.results.filter((result) => result.datasetId === datasetId);
      return [datasetId, datasetResults.length > 0 ? computeMetrics(datasetResults) : null];
    }),
  ) as EvalReport["byDataset"];
  return {
    generatedAtIso: new Date().toISOString(),
    evalVersion: EVAL_VERSION,
    algorithmFingerprint: input.fingerprint,
    options: {
      datasets: input.options.datasets,
      limit: input.options.limit,
      guitarSetMode: input.options.guitarSetMode,
    },
    datasetSkips,
    cache: {
      hits: input.results.filter((result) => result.cacheStatus === "hit").length,
      misses: input.results.filter((result) => result.cacheStatus === "miss").length,
    },
    implementation: "frontend",
    summary: computeMetrics(input.results),
    byDataset,
    samples: input.results,
  };
}

function parseArgs(argv: string[], defaultCacheRoot: string): EvalCliOptions {
  const options: EvalCliOptions = {
    cacheRoot: defaultCacheRoot,
    datasets: [...DATASET_IDS],
    force: false,
    refreshDatasets: false,
    prepareOnly: false,
    guitarSetMode: "comp",
    limit: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--datasets") {
      options.datasets = parseDatasets(readValue(argv, ++i, arg));
    } else if (arg === "--limit") {
      options.limit = parsePositiveInt(readValue(argv, ++i, arg), arg);
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--refresh-datasets") {
      options.refreshDatasets = true;
    } else if (arg === "--prepare-only") {
      options.prepareOnly = true;
    } else if (arg === "--cache-root") {
      options.cacheRoot = path.resolve(readValue(argv, ++i, arg));
    } else if (arg === "--guitarset-mode") {
      options.guitarSetMode = parseGuitarSetMode(readValue(argv, ++i, arg));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function parseDatasets(value: string): DatasetId[] {
  const datasets = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (datasets.length === 0) throw new Error("--datasets requires at least one dataset");
  for (const dataset of datasets) {
    if (!DATASET_IDS.includes(dataset as DatasetId)) throw new Error(`Unknown dataset: ${dataset}`);
  }
  return datasets as DatasetId[];
}

function parseGuitarSetMode(value: string): EvalCliOptions["guitarSetMode"] {
  if (value === "comp" || value === "all") return value;
  throw new Error(`--guitarset-mode must be "comp" or "all", got ${value}`);
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error(`${flag} requires a positive integer`);
  return parsed;
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function resolvePaths(): { frontendRoot: string; cacheRoot: string } {
  const evalDir = path.dirname(fileURLToPath(import.meta.url));
  const frontendRoot = path.resolve(evalDir, "../..");
  const projectRoot = path.resolve(frontendRoot, "../..");
  return {
    frontendRoot,
    cacheRoot: path.join(projectRoot, ".eval-cache", "chord-detection"),
  };
}

function printSummary(report: EvalReport, markdownPath: string): void {
  const summary = report.summary.summary;
  console.log("");
  console.log("Chord detection eval complete");
  console.log(`Evaluated: ${summary.evaluated}`);
  console.log(`Top-1 accuracy: ${pct(summary.accuracy)}`);
  console.log(`Verifier recall: ${pct(summary.verifierRecall)}`);
  console.log(`False accept trials: ${pct(summary.falseAcceptRate)}`);
  console.log(`Wrong-accept samples: ${pct(summary.wrongAcceptedRate)}`);
  console.log(`Uncertain: ${pct(summary.unknownRate)}`);
  console.log(`Cache: ${report.cache.hits} hits, ${report.cache.misses} misses`);
  console.log(`Report: ${markdownPath}`);
}

function printHelp(): void {
  console.log(`Usage: pnpm eval:chords -- [options]

Options:
  --datasets isolated-guitar-chords,guitarset
  --limit 100
  --force
  --refresh-datasets
  --prepare-only
  --cache-root /path/to/cache
  --guitarset-mode comp|all
`);
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
