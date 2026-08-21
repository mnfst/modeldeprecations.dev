import type { SourceEntry } from "./registry.js";
import type { SourceErrorCode } from "./report.js";
import { convertHtml, HtmlConversionError } from "./html.js";

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 30_000;

export class SourceFetchError extends Error {
  attempts = 0;

  constructor(
    readonly code: SourceErrorCode,
    message: string,
    readonly retryable = false,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

export interface FetchSourceOptions {
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
}

export interface FetchedSource {
  body: Buffer;
  attempts: number;
}

function retryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
}

function parseRetryAfter(value: string | null, now: number): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
  }
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.min(Math.max(date - now, 0), MAX_RETRY_DELAY_MS);
}

async function readBounded(
  response: Response,
  maxBytes: number,
  limitName: "max_bytes" | "max_download_bytes",
): Promise<Buffer> {
  const stated = response.headers.get("content-length");
  if (stated && Number(stated) > maxBytes) {
    throw new SourceFetchError("too_large", `response exceeds ${limitName}`);
  }
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let chunk = await reader.read();
  while (!chunk.done) {
    size += chunk.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new SourceFetchError("too_large", `response exceeds ${limitName}`);
    }
    chunks.push(chunk.value);
    chunk = await reader.read();
  }
  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    size,
  );
}

function decodeUtf8(raw: Buffer): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    throw new SourceFetchError("invalid_utf8", "response is not valid UTF-8");
  }
  return text;
}

function normalize(text: string): Buffer {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+$/gm, "")
    .replace(/\n*$/, "");
  return Buffer.from(`${normalized}\n`, "utf8");
}

function prepareBody(source: SourceEntry, raw: Buffer): Buffer {
  const text = decodeUtf8(raw);
  if (source.format === "markdown") return normalize(text);
  try {
    return normalize(convertHtml(source, text));
  } catch (error) {
    if (error instanceof HtmlConversionError) {
      throw new SourceFetchError(error.code, error.message);
    }
    throw new SourceFetchError("conversion_failed", "HTML conversion failed");
  }
}

function validateBody(source: SourceEntry, body: Buffer, baseline?: Buffer): void {
  if (body.byteLength < source.min_bytes) {
    throw new SourceFetchError("too_small", "response is below min_bytes");
  }
  if (body.byteLength > source.max_bytes) {
    throw new SourceFetchError("too_large", "response exceeds max_bytes");
  }
  const text = body.toString("utf8");
  if (source.required_markers.some((marker) => !text.includes(marker))) {
    throw new SourceFetchError("missing_marker", "response is missing a required marker");
  }
  if (baseline && body.byteLength < baseline.byteLength * 0.6) {
    throw new SourceFetchError("shrink", "response is more than 40% shorter than baseline");
  }
}

async function oneAttempt(
  source: SourceEntry,
  baseline: Buffer | undefined,
  fetchImpl: typeof fetch,
  now: () => number,
  timeoutMs: number,
): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(source.url, {
      headers: {
        "accept-language": "en",
        "user-agent": "modeldeprecations.dev source monitor/1.0",
      },
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      throw new SourceFetchError("redirect", "source returned a redirect");
    }
    if ([408, 429].includes(response.status) || response.status >= 500) {
      throw new SourceFetchError(
        "http_status",
        `source returned HTTP ${response.status}`,
        true,
        parseRetryAfter(response.headers.get("retry-after"), now()),
      );
    }
    if (!response.ok) {
      throw new SourceFetchError("http_status", `source returned HTTP ${response.status}`);
    }
    const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    const expectedType = source.format === "html" ? "text/html" : "text/markdown";
    if (mediaType !== expectedType) {
      throw new SourceFetchError("content_type", `source did not return ${expectedType}`);
    }
    const maxDownloadBytes = source.max_download_bytes ?? source.max_bytes;
    const limitName = source.format === "html" ? "max_download_bytes" : "max_bytes";
    const body = prepareBody(source, await readBounded(response, maxDownloadBytes, limitName));
    validateBody(source, body, baseline);
    return body;
  } catch (error) {
    if (error instanceof SourceFetchError) throw error;
    if (controller.signal.aborted) {
      throw new SourceFetchError("timeout", "source request timed out", true);
    }
    throw new SourceFetchError("network", "source request failed", true);
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchSource(
  source: SourceEntry,
  baseline?: Buffer,
  options: FetchSourceOptions = {},
): Promise<FetchedSource> {
  const fetchImpl = options.fetch ?? fetch;
  const sleep =
    options.sleep ??
    ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return {
        body: await oneAttempt(source, baseline, fetchImpl, now, timeoutMs),
        attempts: attempt,
      };
    } catch (error) {
      const failure = error as SourceFetchError;
      failure.attempts = attempt;
      if (!failure.retryable || attempt === MAX_ATTEMPTS) throw failure;
      await sleep(failure.retryAfterMs ?? retryDelay(attempt));
    }
  }
  throw new SourceFetchError("network", "source request failed");
}
