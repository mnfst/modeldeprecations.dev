import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import { Model, modelId, type Model as ModelType } from "../schema/model.js";
import { MODELS_DIR } from "./paths.js";

export interface LoadIssue {
  file: string;
  message: string;
}

export interface LoadResult {
  models: ModelType[];
  issues: LoadIssue[];
}

async function walkYamlFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walkYamlFiles(full)));
    else if (entry.isFile() && /\.(ya?ml)$/i.test(entry.name)) found.push(full);
  }
  return found.sort();
}

function formatZodIssue(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("; ");
}

function expectedIdFromPath(file: string, modelsDir: string): string {
  const rel = path.relative(modelsDir, file);
  const parts = rel.split(path.sep);
  if (parts.length < 2) return "";
  return `${parts[0]!}/${parts
    .slice(1)
    .join("/")
    .replace(/\.(ya?ml)$/i, "")}`;
}

function validateOne(
  file: string,
  raw: unknown,
  modelsDir: string,
): { model?: ModelType; issue?: LoadIssue } {
  const parsed = Model.safeParse(raw);
  if (!parsed.success) return { issue: { file, message: formatZodIssue(parsed.error) } };

  const model = parsed.data;
  const expectedId = expectedIdFromPath(file, modelsDir);
  const derivedId = modelId(model);
  if (expectedId && derivedId !== expectedId) {
    return {
      issue: {
        file,
        message: `derived id "${derivedId}" does not match "${expectedId}" from the file path. Expected models/${model.provider}/${model.model}.yaml.`,
      },
    };
  }
  return { model };
}

/**
 * Checks that need the whole catalog: ids and aliases must be globally
 * unambiguous, and every replacement that claims to have a page must have one.
 */
export function crossCheck(models: ModelType[]): LoadIssue[] {
  const issues: LoadIssue[] = [];
  const ids = new Set(models.map((model) => modelId(model)));
  const seenAlias = new Map<string, string>();

  for (const model of models) {
    const id = modelId(model);
    const file = `models/${id}.yaml`;

    for (const alias of model.aliases) {
      const aliasId = `${model.provider}/${alias}`;
      if (ids.has(aliasId)) {
        issues.push({
          file,
          message: `alias "${alias}" is also a canonical model id — one of the two must go`,
        });
      }
      const owner = seenAlias.get(aliasId);
      if (owner && owner !== id) {
        issues.push({ file, message: `alias "${alias}" is already claimed by ${owner}` });
      }
      seenAlias.set(aliasId, id);
    }

    for (const replacement of model.replacements) {
      if (replacement.external) continue;
      const target = `${replacement.provider}/${replacement.model}`;
      if (!ids.has(target)) {
        issues.push({
          file,
          message: `replacement "${target}" has no page. Add one, or mark the replacement external: true.`,
        });
      }
    }
  }
  return issues;
}

export async function loadAllModels(modelsDir: string = MODELS_DIR): Promise<LoadResult> {
  const files = await walkYamlFiles(modelsDir);
  const models: ModelType[] = [];
  const issues: LoadIssue[] = [];

  for (const file of files) {
    let raw: unknown;
    try {
      raw = yaml.load(await fs.readFile(file, "utf8"), { schema: yaml.JSON_SCHEMA });
    } catch (err) {
      issues.push({ file, message: `failed to parse YAML: ${(err as Error).message}` });
      continue;
    }
    const result = validateOne(file, raw, modelsDir);
    if (result.issue) issues.push(result.issue);
    else models.push(result.model!);
  }

  models.sort((a, b) => modelId(a).localeCompare(modelId(b)));
  issues.push(...crossCheck(models));
  return { models, issues };
}
