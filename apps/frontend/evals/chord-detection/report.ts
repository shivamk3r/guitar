import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureDir } from "./fs-utils";
import type { EvalReport, MetricsReport } from "./types";

export async function writeReports(
  cacheRoot: string,
  report: EvalReport,
): Promise<{
  jsonPath: string;
  markdownPath: string;
}> {
  const reportsDir = path.join(cacheRoot, "reports");
  await ensureDir(reportsDir);
  const jsonPath = path.join(reportsDir, "latest.json");
  const markdownPath = path.join(reportsDir, "latest.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, renderMarkdownReport(report));
  return { jsonPath, markdownPath };
}

export function renderMarkdownReport(report: EvalReport): string {
  const lines = [
    "# Chord Detection Eval Report",
    "",
    `Generated: ${report.generatedAtIso}`,
    `Algorithm fingerprint: \`${report.algorithmFingerprint}\``,
    `Datasets: ${report.options.datasets.join(", ")}`,
    `Cache: ${report.cache.hits} hits, ${report.cache.misses} misses`,
    "",
    "## Headline",
    "",
    renderMetricsTable([["overall", report.summary], ...datasetRows(report)]),
    "",
    "## Threshold Sweep",
    "",
    renderThresholdTable(report.thresholdSweep),
    "",
    "## Per-Chord Baseline",
    "",
    renderPerChordTable(report.summary),
    "",
    "## Top Confusions",
    "",
    renderTopConfusions(report.summary),
    "",
    "## Dataset Skips",
    "",
    renderSkips(report),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function datasetRows(report: EvalReport): Array<[string, MetricsReport]> {
  return Object.entries(report.byDataset).flatMap(([datasetId, metrics]) =>
    metrics ? ([[datasetId, metrics]] as Array<[string, MetricsReport]>) : [],
  );
}

function renderMetricsTable(rows: Array<[string, MetricsReport]>): string {
  return [
    "| Scope | Evaluated | Accuracy | Verifier recall | False reject | Wrong accepted | Unknown |",
    "|---|---:|---:|---:|---:|---:|---:|",
    ...rows.map(([label, metrics]) => {
      const summary = metrics.summary;
      return `| ${label} | ${summary.evaluated} | ${pct(summary.accuracy)} | ${pct(
        summary.verifierRecall,
      )} | ${pct(summary.falseRejectRate)} | ${pct(summary.wrongAcceptedRate)} | ${pct(
        summary.unknownRate,
      )} |`;
    }),
  ].join("\n");
}

function renderThresholdTable(metrics: readonly MetricsReport[]): string {
  return [
    "| Similarity | Margin | Verifier recall | False reject | Wrong accepted | Unknown |",
    "|---:|---:|---:|---:|---:|---:|",
    ...metrics.map((item) => {
      const summary = item.summary;
      return `| ${item.threshold.similarity.toFixed(2)} | ${item.threshold.margin.toFixed(
        2,
      )} | ${pct(summary.verifierRecall)} | ${pct(summary.falseRejectRate)} | ${pct(
        summary.wrongAcceptedRate,
      )} | ${pct(summary.unknownRate)} |`;
    }),
  ].join("\n");
}

function renderPerChordTable(metrics: MetricsReport): string {
  return [
    "| Chord | Support | Precision | Recall | F1 |",
    "|---|---:|---:|---:|---:|",
    ...metrics.perChord.map(
      (item) =>
        `| ${item.chordId} | ${item.support} | ${pct(item.precision)} | ${pct(
          item.recall,
        )} | ${pct(item.f1)} |`,
    ),
  ].join("\n");
}

function renderTopConfusions(metrics: MetricsReport): string {
  const rows = Object.entries(metrics.confusionMatrix)
    .flatMap(([expected, predictions]) =>
      Object.entries(predictions)
        .filter(([predicted]) => predicted !== expected)
        .map(([predicted, count]) => ({ expected, predicted, count })),
    )
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
  if (rows.length === 0) return "No confusions.";
  return [
    "| Expected | Predicted | Count |",
    "|---|---|---:|",
    ...rows.map((row) => `| ${row.expected} | ${row.predicted} | ${row.count} |`),
  ].join("\n");
}

function renderSkips(report: EvalReport): string {
  const rows = Object.entries(report.datasetSkips).flatMap(([datasetId, skips]) =>
    skips.map((skip) => `| ${datasetId} | ${skip.reason} | ${skip.count} |`),
  );
  if (rows.length === 0) return "No dataset skips.";
  return ["| Dataset | Reason | Count |", "|---|---|---:|", ...rows].join("\n");
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
