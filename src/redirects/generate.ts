// Reads okapi.bot's model pages (each API's public JSON) and writes the
// redirect map the Worker serves from (src/redirects/okapi-map.json), with how
// many of this site's model URLs land on the same model there. It fails if a
// target of the new map is not a page okapi.bot lists.
//
//   npm run redirects:generate                  rewrite the map
//   npm run redirects:generate -- --report f.md also write what changed, in Markdown
//   npm run redirects:check                     only check the committed map

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
import { apiModels, missingTargets } from "./targets.js";

export const MAP_FILE = path.join(REPO_ROOT, "src", "redirects", "okapi-map.json");

type RedirectMap = Record<string, string>;

/**
 * One okapi.bot API's model pages; null when okapi.bot has no such API, or
 * redirects it (an API merged into another, as vertex-ai-2 into vertex-ai).
 */
async function readApi(slug: string): Promise<ApiModels | null> {
  const res = await fetch(`${OKAPI}/api/v1/providers/${slug}.json`, { redirect: "manual" });
  if (res.status === 404 || (res.status >= 300 && res.status < 400)) return null;
  if (!res.ok) throw new Error(`${slug}: okapi.bot answered ${res.status}`);
  return apiModels(slug, await res.json());
}

async function readOkapi(): Promise<Record<string, ApiModels>> {
  const okapi: Record<string, ApiModels> = {};
  for (const slug of new Set(Object.values(PROVIDER_APIS).flat())) {
    const api = await readApi(slug);
    if (api) okapi[slug] = api;
    else console.warn(`okapi.bot has no API ${slug}`);
  }
  return okapi;
}

async function readSite(): Promise<SiteModel[]> {
  const { models, issues } = await loadAllModels();
  if (issues.length) throw new Error(`${issues.length} model files do not load`);
  return models.map((m) => ({ provider: m.provider, model: m.model, aliases: m.aliases }));
}

/** Per provider, how many models land on their own page there and how many on a hub. */
function landings(site: SiteModel[], okapi: Record<string, ApiModels>) {
  const rows: Record<string, { exact: number; hub: number }> = {};
  for (const m of site) {
    const row = (rows[m.provider] ??= { exact: 0, hub: 0 });
    if (modelPage(m.provider, [m.model], okapi)) row.exact++;
    else row.hub++;
  }
  return rows;
}

/** What the new map changes, in Markdown: the stale targets it replaces and every moved path. */
function report(before: RedirectMap, after: RedirectMap, stale: string[]): string {
  const moved = Object.keys({ ...before, ...after })
    .filter((p) => !p.endsWith(".md") && before[p] !== after[p])
    .sort()
    .map((p) => `- \`${p}\`: \`${before[p] ?? "(none)"}\` → \`${after[p] ?? "(none)"}\``);
  const list = (items: string[]) => (items.length ? items.join("\n") : "None.");
  return [
    `### Targets okapi.bot no longer lists (${stale.length})`,
    list(stale.map((s) => `- \`${s}\``)),
    `### Pages that move (${moved.length}, not counting their \`.md\`)`,
    list(moved),
    "",
  ].join("\n\n");
}

async function readMap(): Promise<RedirectMap> {
  return JSON.parse(await fs.readFile(MAP_FILE, "utf8")) as RedirectMap;
}

async function main(args: string[]): Promise<void> {
  const okapi = await readOkapi();
  const before = await readMap();
  const stale = missingTargets(before, okapi);
  if (args.includes("--check")) {
    if (stale.length) throw new Error(`Targets okapi.bot does not list:\n${stale.join("\n")}`);
    console.log(`All ${Object.keys(before).length} targets are on okapi.bot`);
    return;
  }
  const site = await readSite();
  const map = buildRedirectMap(site, okapi);
  const missing = missingTargets(map, okapi);
  if (missing.length) throw new Error(`The new map has unknown targets:\n${missing.join("\n")}`);
  await fs.writeFile(MAP_FILE, `${JSON.stringify(map, null, 2)}\n`);
  const reportFile = args[args.indexOf("--report") + 1];
  if (args.includes("--report") && reportFile) {
    await fs.writeFile(reportFile, report(before, map, stale));
  }
  if (stale.length) console.warn(`Replaced ${stale.length} targets okapi.bot no longer lists`);
  console.table(landings(site, okapi));
  console.log(`${Object.keys(map).length} paths → ${path.relative(REPO_ROOT, MAP_FILE)}`);
}

main(process.argv.slice(2)).catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
