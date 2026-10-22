// Reads okapi.bot's model pages (each API's public JSON) and writes the
// redirect map the Worker serves from (src/redirects/okapi-map.json), with how
// many of this site's model URLs land on the same model there.
//
//   npm run redirects:generate

import fs from "node:fs/promises";
import path from "node:path";
import { loadAllModels } from "../data/load.js";
import { REPO_ROOT } from "../data/paths.js";
import {
  ApiModels,
  buildRedirectMap,
  modelPage,
  OKAPI,
  PROVIDER_APIS,
  SiteModel,
} from "./okapi.js";

export const MAP_FILE = path.join(REPO_ROOT, "src", "redirects", "okapi-map.json");

interface OkapiApiJson {
  breakingChanges: Array<{ model: string | null; url: string }>;
}

/** One okapi.bot API's model pages; null when okapi.bot has no such API. */
async function readApi(slug: string): Promise<ApiModels | null> {
  const res = await fetch(`${OKAPI}/api/v1/providers/${slug}.json`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${slug}: okapi.bot answered ${res.status}`);
  const body = (await res.json()) as OkapiApiJson;
  const pages: ApiModels = {};
  for (const c of body.breakingChanges) if (c.model) pages[c.model.toLowerCase()] = c.url;
  return pages;
}

async function main(): Promise<void> {
  const { models, issues } = await loadAllModels();
  if (issues.length) throw new Error(`${issues.length} model files do not load`);
  const okapi: Record<string, ApiModels> = {};
  for (const slug of new Set(Object.values(PROVIDER_APIS).flat())) {
    const api = await readApi(slug);
    if (api) okapi[slug] = api;
    else console.warn(`okapi.bot has no API ${slug}`);
  }
  const site: SiteModel[] = models.map((m) => ({
    provider: m.provider,
    model: m.model,
    aliases: m.aliases,
  }));
  const map = buildRedirectMap(site, okapi);
  await fs.writeFile(MAP_FILE, `${JSON.stringify(map, null, 2)}\n`);
  const rows: Record<string, { exact: number; hub: number }> = {};
  for (const m of site) {
    const row = (rows[m.provider] ??= { exact: 0, hub: 0 });
    if (modelPage(m.provider, [m.model], okapi)) row.exact++;
    else row.hub++;
  }
  console.table(rows);
  console.log(`${Object.keys(map).length} paths → ${path.relative(REPO_ROOT, MAP_FILE)}`);
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
