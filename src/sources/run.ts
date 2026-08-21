import { SourceFetchError, fetchSource, type FetchSourceOptions } from "./fetch-source.js";
import { atomicWrite, readOptional, sha256 } from "./files.js";
import { snapshotPath, type SourceEntry, type SourceRegistry } from "./registry.js";
import { SourceReportSchema, type SourceReport, type SourceResult } from "./report.js";

export interface RunOptions {
  snapshotsDir: string;
  reportFile: string;
  concurrency?: number;
  now?: () => Date;
  fetch?: FetchSourceOptions;
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await operation(values[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

function errorResult(source: SourceEntry, failure: SourceFetchError): SourceResult {
  return {
    provider: source.provider,
    slug: source.slug,
    url: source.url,
    status: "error",
    attempts: failure.attempts,
    error_code: failure.code,
    error_message: failure.message.slice(0, 500),
  };
}

async function processSource(source: SourceEntry, options: RunOptions): Promise<SourceResult> {
  const file = snapshotPath(source, options.snapshotsDir);
  const baseline = await readOptional(file);
  if (!baseline) {
    return errorResult(source, new SourceFetchError("missing_snapshot", "snapshot is missing"));
  }

  try {
    const fetched = await fetchSource(source, baseline, options.fetch);
    const changed = !baseline.equals(fetched.body);
    if (changed) await atomicWrite(file, fetched.body);
    return {
      provider: source.provider,
      slug: source.slug,
      url: source.url,
      status: changed ? "changed" : "unchanged",
      attempts: fetched.attempts,
      before_bytes: baseline.byteLength,
      after_bytes: fetched.body.byteLength,
      before_sha256: sha256(baseline),
      after_sha256: sha256(fetched.body),
    };
  } catch (error) {
    if (error instanceof SourceFetchError) return errorResult(source, error);
    throw error;
  }
}

export async function runSourceFetch(
  registry: SourceRegistry,
  options: RunOptions,
): Promise<SourceReport> {
  const concurrency = options.concurrency ?? 4;
  if (!Number.isInteger(concurrency) || concurrency < 1)
    throw new Error("concurrency must be positive");
  const report: SourceReport = {
    version: 1,
    started_at: (options.now ?? (() => new Date()))().toISOString(),
    results: await mapConcurrent(registry.sources, concurrency, (source) =>
      processSource(source, options),
    ),
  };
  SourceReportSchema.parse(report);
  await atomicWrite(options.reportFile, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
