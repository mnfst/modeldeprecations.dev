import fs from "node:fs/promises";
import path from "node:path";
import { atomicWrite, sha256 } from "./files.js";
import { snapshotPath, sourceId, type SourceRegistry } from "./registry.js";
import { SourceReportSchema, type SourceReport } from "./report.js";

const MAX_REPORT_BYTES = 1_000_000;

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(full)));
    else if (entry.isFile()) files.push(full);
  }
  return files.sort();
}

async function readReport(file: string): Promise<SourceReport> {
  const stat = await fs.stat(file);
  if (stat.size > MAX_REPORT_BYTES) throw new Error("report exceeds size limit");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    throw new Error("report is not valid JSON");
  }
  return SourceReportSchema.parse(parsed);
}

function artifactSnapshot(source: SourceRegistry["sources"][number], artifactDir: string): string {
  return snapshotPath(source, path.join(artifactDir, "snapshots"));
}

export interface ArtifactResult {
  report: SourceReport;
  changed: number;
  errors: number;
}

export async function validateAndApplyArtifact(
  registry: SourceRegistry,
  artifactDir: string,
  checkoutSnapshotsDir: string,
): Promise<ArtifactResult> {
  const reportFile = path.join(artifactDir, ".source-fetch", "report.json");
  const report = await readReport(reportFile);
  const sources = new Map(registry.sources.map((source) => [sourceId(source), source]));
  const results = new Map<string, SourceReport["results"][number]>();

  for (const result of report.results) {
    const id = `${result.provider}/${result.slug}`;
    const source = sources.get(id);
    if (!source || source.url !== result.url)
      throw new Error(`report contains unknown source ${id}`);
    if (results.has(id)) throw new Error(`report contains duplicate source ${id}`);
    results.set(id, result);
  }
  if (results.size !== sources.size) throw new Error("report does not cover every registry source");

  const allowed = new Set([
    reportFile,
    ...registry.sources.map((source) => artifactSnapshot(source, artifactDir)),
  ]);
  for (const file of await walkFiles(artifactDir)) {
    if (!allowed.has(file))
      throw new Error(`artifact contains unexpected file ${path.relative(artifactDir, file)}`);
  }

  for (const source of registry.sources) {
    const id = sourceId(source);
    const result = results.get(id)!;
    const artifactFile = artifactSnapshot(source, artifactDir);
    const contents = await fs.readFile(artifactFile);
    if (contents.byteLength > source.max_bytes) throw new Error(`${id} exceeds max_bytes`);

    if (result.status === "error") {
      const baseline = await fs.readFile(snapshotPath(source, checkoutSnapshotsDir));
      if (!contents.equals(baseline)) throw new Error(`${id} changed despite an error result`);
      continue;
    }
    if (contents.byteLength !== result.after_bytes || sha256(contents) !== result.after_sha256) {
      throw new Error(`${id} does not match its reported hash and size`);
    }
    if (result.status === "changed") {
      await atomicWrite(snapshotPath(source, checkoutSnapshotsDir), contents);
    }
  }

  return {
    report,
    changed: report.results.filter((result) => result.status === "changed").length,
    errors: report.results.filter((result) => result.status === "error").length,
  };
}
