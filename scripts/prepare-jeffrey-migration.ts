import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  classifyObsidianMigrationPath,
  type ObsidianMigrationDisposition,
  type ObsidianMigrationGroup,
} from "../lib/knowledge/obsidian-selection.ts";

const projectRoot = process.cwd();
const privateRoot = path.join(projectRoot, "private-data", "jeffrey-migration");
const outputRoot = path.join(privateRoot, "import-ready");

type ManifestEntry = {
  group: ObsidianMigrationGroup;
  sourcePath: string;
  disposition: ObsidianMigrationDisposition;
  bytes: number;
  sha256: string;
};

async function walk(root: string, relative = ""): Promise<string[]> {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) files.push(...await walk(root, child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

async function processGroup(group: ObsidianMigrationGroup) {
  const sourceRoot = path.join(privateRoot, "source", group);
  const files = await walk(sourceRoot);
  const manifest: ManifestEntry[] = [];
  for (const relativePath of files) {
    const source = path.join(sourceRoot, relativePath);
    const disposition = classifyObsidianMigrationPath(group, relativePath);
    const info = await stat(source);
    const bytes = await readFile(source);
    manifest.push({
      group,
      sourcePath: relativePath.replace(/\\/g, "/"),
      disposition,
      bytes: info.size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    if (disposition !== "knowledge" && disposition !== "media") continue;
    const destination = path.join(outputRoot, disposition, group, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
  return manifest;
}

await mkdir(outputRoot, { recursive: true });
const entries = [
  ...await processGroup("character"),
  ...await processGroup("user-profile"),
].sort((left, right) => `${left.group}/${left.sourcePath}`.localeCompare(`${right.group}/${right.sourcePath}`, "zh-CN"));

const summary = entries.reduce<Record<ObsidianMigrationDisposition, number>>((counts, entry) => {
  counts[entry.disposition] += 1;
  return counts;
}, { knowledge: 0, media: 0, archive: 0, excluded: 0 });

await writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, entries }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(summary)}\n`);
