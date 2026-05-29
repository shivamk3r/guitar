import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureDir } from "./fs-utils";
import { type EvalReport, type MetricsReport, WCSR_VARIANT_IDS, type WcsrVariantId } from "./types";

export async function writeReports(
  cacheRoot: string,
  report: EvalReport,
): Promise<{
  jsonPath: string;
  markdownPath: string;
}> {
  const reportsDir = path.join(cacheRoot, "reports", report.implementation);
  await ensureDir(reportsDir);
  const jsonPath = path.join(reportsDir, "latest.json");
  const markdownPath = path.join(reportsDir, "latest.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, renderMarkdownReport(report));
  return { jsonPath, markdownPath };
}

export async function writeComparisonReport(
  cacheRoot: string,
  input: { frontend: EvalReport; python: EvalReport },
): Promise<{ jsonPath: string; markdownPath: string }> {
  const reportsDir = path.join(cacheRoot, "reports", "comparison");
  await ensureDir(reportsDir);
  const generatedAtIso = new Date().toISOString();
  const jsonPath = path.join(reportsDir, "latest.json");
  const markdownPath = path.join(reportsDir, "latest.md");
  await writeFile(
    jsonPath,
    `${JSON.stringify({ generatedAtIso, frontend: input.frontend, python: input.python }, null, 2)}\n`,
  );
  await writeFile(markdownPath, renderComparisonMarkdown({ generatedAtIso, ...input }));
  return { jsonPath, markdownPath };
}

export function renderMarkdownReport(report: EvalReport): string {
  const lines = [
    `# Chord Detection Eval Report (${report.implementation})`,
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
    "## WCSR",
    "",
    renderWcsrTable(report.summary),
    "",
    "## Per-Chord Verifier",
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

export function renderComparisonMarkdown(input: {
  generatedAtIso: string;
  frontend: EvalReport;
  python: EvalReport;
}): string {
  const lines = [
    "# Chord Detection Eval Comparison",
    "",
    `Generated: ${input.generatedAtIso}`,
    "",
    renderMetricsTable([
      ["frontend overall", input.frontend.summary],
      ["python overall", input.python.summary],
      ...datasetRows(input.frontend).map(
        ([datasetId, metrics]) => [`frontend ${datasetId}`, metrics] as [string, MetricsReport],
      ),
      ...datasetRows(input.python).map(
        ([datasetId, metrics]) => [`python ${datasetId}`, metrics] as [string, MetricsReport],
      ),
    ]),
    "",
    "## Fingerprints",
    "",
    `- Frontend: \`${input.frontend.algorithmFingerprint}\``,
    `- Python: \`${input.python.algorithmFingerprint}\``,
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
    "| Scope | Evaluated | Duration | Top-1 accuracy | Exact WCSR | Root WCSR | Maj-Min WCSR | Sevenths WCSR | Verifier recall | Verifier weighted recall | Positive rejected | Uncertain | False accept trials | Wrong-accept samples |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...rows.map(([label, metrics]) => {
      const summary = metrics.summary;
      return `| ${label} | ${summary.evaluated} | ${seconds(summary.totalDurationSec)} | ${pct(
        summary.accuracy,
      )} | ${pct(summary.wcsr.exact.score)} | ${pct(summary.wcsr.root.score)} | ${pct(
        summary.wcsr.majmin.score,
      )} | ${pct(summary.wcsr.sevenths.score)} | ${pct(summary.verifierRecall)} | ${pct(
        summary.verifierWeightedRecall,
      )} | ${pct(summary.rejectedRate)} | ${pct(summary.unknownRate)} | ${pct(
        summary.falseAcceptRate,
      )} | ${pct(summary.wrongAcceptedRate)} |`;
    }),
  ].join("\n");
}

function renderWcsrTable(metrics: MetricsReport): string {
  return [
    "| Variant | Score | Valid duration | Correct duration | Out-of-gamut duration |",
    "|---|---:|---:|---:|---:|",
    ...WCSR_VARIANT_IDS.map((variant) => {
      const item = metrics.summary.wcsr[variant];
      return `| ${wcsrLabel(variant)} | ${pct(item.score)} | ${seconds(
        item.validDurationSec,
      )} | ${seconds(item.correctDurationSec)} | ${seconds(item.outOfGamutDurationSec)} |`;
    }),
  ].join("\n");
}

function renderPerChordTable(metrics: MetricsReport): string {
  return [
    "| Chord | Support | Accepted target precision | Verifier recall | F1 |",
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
    "| Expected | Top-1 predicted | Count |",
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

function seconds(value: number): string {
  return `${value.toFixed(1)}s`;
}

function wcsrLabel(variant: WcsrVariantId): string {
  const labels: Record<WcsrVariantId, string> = {
    exact: "Exact",
    root: "Root",
    mirex: "MIREX",
    thirds: "Thirds",
    thirdsInv: "Thirds + bass",
    triads: "Triads",
    triadsInv: "Triads + bass",
    tetrads: "Tetrads",
    tetradsInv: "Tetrads + bass",
    majmin: "Maj-Min",
    majminInv: "Maj-Min + bass",
    sevenths: "Sevenths",
    seventhsInv: "Sevenths + bass",
  };
  return labels[variant];
}
