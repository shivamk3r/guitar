import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function removeDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function listFiles(
  root: string,
  predicate: (filePath: string) => boolean,
): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const next = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(next);
      else if (entry.isFile() && predicate(next)) out.push(next);
    }
  }
  if (await exists(root)) await walk(root);
  return out.sort();
}

export async function fileStatFingerprint(filePath: string): Promise<string> {
  const s = await stat(filePath);
  return `${s.size}:${Math.round(s.mtimeMs)}`;
}

export async function downloadFile(
  url: string,
  targetPath: string,
  refresh: boolean,
): Promise<void> {
  if (!refresh && (await exists(targetPath))) return;
  await ensureDir(path.dirname(targetPath));
  const partPath = `${targetPath}.part`;
  await rm(partPath, { force: true });
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`download failed ${response.status} ${response.statusText}: ${url}`);
  }
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(partPath));
  await rename(partPath, targetPath);
}

export function encodeUrlPath(relativePath: string): string {
  return relativePath.split("/").map(encodeURIComponent).join("/");
}
