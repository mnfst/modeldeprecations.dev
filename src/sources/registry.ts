import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { parse } from "node-html-parser";
import { z } from "zod";
import { MODELS_DIR, SNAPSHOTS_DIR, SOURCES_FILE } from "../data/paths.js";

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

// modelparams.dev is the provider taxonomy source of truth.
export const MODEL_PARAMS_PROVIDERS = [
  "alibaba",
  "anthropic",
  "bedrock",
  "cerebras",
  "cohere",
  "deepseek",
  "fireworks",
  "google",
  "groq",
  "meta",
  "minimax",
  "mistral",
  "moonshot",
  "nvidia",
  "openai",
  "perplexity",
  "thinking-machines",
  "vertex",
  "xai",
  "xiaomi",
  "z-ai",
] as const;

const Provider = z.enum(MODEL_PARAMS_PROVIDERS);
const Slug = z.string().regex(SLUG, "must be a lowercase kebab-case slug");
const Format = z.enum(["markdown", "html"]);

const SourceUrl = z
  .string()
  .url()
  .superRefine((value, ctx) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return;
    }
    if (parsed.protocol !== "https:") ctx.addIssue({ code: "custom", message: "must use HTTPS" });
    if (parsed.username || parsed.password) {
      ctx.addIssue({ code: "custom", message: "must not contain credentials" });
    }
    if (parsed.hash) ctx.addIssue({ code: "custom", message: "must not contain a fragment" });
  });

export const SourceEntrySchema = z
  .object({
    provider: Provider,
    slug: Slug,
    catalog_provider: Slug.optional(),
    format: Format.default("markdown"),
    url: SourceUrl,
    html_selector: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[^\r\n]+$/)
      .optional(),
    max_download_bytes: z.number().int().positive().max(5_000_000).optional(),
    min_bytes: z.number().int().positive(),
    max_bytes: z.number().int().positive(),
    required_markers: z.array(z.string().min(1).max(200)).min(1),
  })
  .strict()
  .superRefine((source, ctx) => {
    let pathname: string | undefined;
    try {
      pathname = new URL(source.url).pathname;
    } catch {
      pathname = undefined;
    }
    if (source.format === "markdown" && pathname && !pathname.endsWith(".md")) {
      ctx.addIssue({ code: "custom", path: ["url"], message: "path must end in .md" });
    }
    if (source.format === "html" && !source.html_selector) {
      ctx.addIssue({ code: "custom", path: ["html_selector"], message: "is required for HTML" });
    }
    if (source.html_selector) {
      try {
        parse("<main></main>").querySelector(source.html_selector);
      } catch {
        ctx.addIssue({ code: "custom", path: ["html_selector"], message: "is not valid CSS" });
      }
    }
    if (source.format === "html" && !source.max_download_bytes) {
      ctx.addIssue({
        code: "custom",
        path: ["max_download_bytes"],
        message: "is required for HTML",
      });
    }
    if (source.format === "markdown" && (source.html_selector || source.max_download_bytes)) {
      ctx.addIssue({ code: "custom", message: "HTML fields require format: html" });
    }
    if (source.max_bytes <= source.min_bytes) {
      ctx.addIssue({
        code: "custom",
        path: ["max_bytes"],
        message: "must be greater than min_bytes",
      });
    }
  });

const RegistrySchema = z.object({ sources: z.array(SourceEntrySchema).min(1) }).strict();

export type SourceEntry = z.infer<typeof SourceEntrySchema>;

export interface SourceRegistry {
  sources: SourceEntry[];
}

export interface SourceIssue {
  file: string;
  message: string;
}

export function sourceId(source: Pick<SourceEntry, "provider" | "slug">): string {
  return `${source.provider}/${source.slug}`;
}

export function snapshotPath(source: SourceEntry, root = SNAPSHOTS_DIR): string {
  const resolved = path.resolve(root, source.provider, `${source.slug}.md`);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`snapshot path escapes root for ${sourceId(source)}`);
  }
  return resolved;
}

function formatZod(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("; ");
}

async function directoryExists(dir: string): Promise<boolean> {
  try {
    return (await fs.stat(dir)).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function crossCheck(
  registry: SourceRegistry,
  file: string,
  modelsDir: string,
): Promise<SourceIssue[]> {
  const issues: SourceIssue[] = [];
  const ids = new Set<string>();
  const urls = new Set<string>();

  for (const source of registry.sources) {
    const id = sourceId(source);
    if (ids.has(id)) issues.push({ file, message: `duplicate source id ${id}` });
    if (urls.has(source.url)) issues.push({ file, message: `duplicate source URL ${source.url}` });
    ids.add(id);
    urls.add(source.url);
    snapshotPath(source);

    if (source.catalog_provider) {
      const exists = await directoryExists(path.join(modelsDir, source.catalog_provider));
      if (!exists) {
        issues.push({ file, message: `${id} maps to missing models/${source.catalog_provider}/` });
      }
    }
  }
  return issues;
}

export async function loadSourceRegistry(
  file = SOURCES_FILE,
  modelsDir = MODELS_DIR,
): Promise<{ registry?: SourceRegistry; issues: SourceIssue[] }> {
  let raw: unknown;
  try {
    raw = yaml.load(await fs.readFile(file, "utf8"), { schema: yaml.JSON_SCHEMA });
  } catch (error) {
    return { issues: [{ file, message: `failed to parse YAML: ${(error as Error).message}` }] };
  }

  const parsed = RegistrySchema.safeParse(raw);
  if (!parsed.success) return { issues: [{ file, message: formatZod(parsed.error) }] };
  const registry = parsed.data;
  const issues = await crossCheck(registry, file, modelsDir);
  return { registry, issues };
}

async function walkMarkdown(dir: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walkMarkdown(full)));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(full);
  }
  return files.sort();
}

export async function validateSnapshotInventory(
  registry: SourceRegistry,
  root = SNAPSHOTS_DIR,
): Promise<SourceIssue[]> {
  const expected = new Set(registry.sources.map((source) => snapshotPath(source, root)));
  const actual = new Set(await walkMarkdown(root));
  const issues: SourceIssue[] = [];
  for (const file of expected) {
    if (!actual.has(file)) issues.push({ file, message: "snapshot is missing" });
  }
  for (const file of actual) {
    if (!expected.has(file)) issues.push({ file, message: "snapshot has no registry row" });
  }
  return issues;
}
