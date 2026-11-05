// What generate.ts reads from okapi.bot and checks before it writes the map:
// each API's model pages, from its public JSON, and that every target of the
// map is one of them, an API's models hub or one of okapi.bot's hubs.

import { ApiModels, OKAPI, STATIC_TARGETS } from "./okapi.js";

/**
 * okapi.bot's public JSON of one API (/api/v1/providers/<slug>.json): of each
 * change, this site reads only `model` and `url`.
 */
export interface OkapiApiJson {
  breakingChanges: Array<{ model?: string | null; url?: string }>;
}

/**
 * An API's model pages from its JSON: lower-case model id → page URL. Only a
 * model's own page counts (/models/<slug>/<model>/): a change page may be a
 * duplicate okapi.bot redirects elsewhere, and a target should not redirect.
 */
export function apiModels(slug: string, body: unknown): ApiModels {
  const changes = (body as Partial<OkapiApiJson> | null)?.breakingChanges;
  if (!Array.isArray(changes)) throw new Error(`${slug}: okapi.bot's JSON has no breakingChanges`);
  const prefix = `${OKAPI}/models/${slug}/`;
  const pages: ApiModels = {};
  for (const { model, url } of changes) {
    if (!model || typeof url !== "string" || !url.startsWith(prefix)) continue;
    pages[model.toLowerCase()] ??= url;
  }
  return pages;
}

/** Every path the map may send to, given the APIs okapi.bot has. */
export function knownTargets(okapi: Record<string, ApiModels>): Set<string> {
  const known = new Set<string>(["/models/", ...Object.values(STATIC_TARGETS)]);
  for (const [slug, pages] of Object.entries(okapi)) {
    known.add(`/models/${slug}/`);
    for (const url of Object.values(pages)) {
      const page = url.replace(OKAPI, "");
      known.add(page);
      known.add(`${page.replace(/\/$/, "")}.md`);
    }
  }
  return known;
}

/** The map's entries whose target okapi.bot does not list: `path → target`. */
export function missingTargets(
  map: Record<string, string>,
  okapi: Record<string, ApiModels>,
): string[] {
  const known = knownTargets(okapi);
  return Object.entries(map)
    .filter(([, target]) => !known.has(target))
    .map(([from, target]) => `${from} → ${target}`);
}
