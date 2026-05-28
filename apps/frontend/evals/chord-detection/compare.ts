import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeComparisonReport } from "./report";
import type { EvalReport } from "./types";

async function main(): Promise<void> {
  const cacheRoot = resolveCacheRoot();
  const frontend = await readReport(path.join(cacheRoot, "reports", "frontend", "latest.json"));
  const python = await readReport(path.join(cacheRoot, "reports", "python", "latest.json"));
  const written = await writeComparisonReport(cacheRoot, { frontend, python });
  console.log(`Chord eval comparison written to ${written.markdownPath}`);
}

async function readReport(filePath: string): Promise<EvalReport> {
  return JSON.parse(await readFile(filePath, "utf8")) as EvalReport;
}

function resolveCacheRoot(): string {
  const evalDir = path.dirname(fileURLToPath(import.meta.url));
  const frontendRoot = path.resolve(evalDir, "../..");
  const projectRoot = path.resolve(frontendRoot, "../..");
  return path.join(projectRoot, ".eval-cache", "chord-detection");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
