// The sitemap, as a pure function of (models, lastmod dates, today).
//
// Shared by the static build and the dev server so the two cannot disagree
// about which URLs exist — a page that 404s in dev but ships in the sitemap is
// exactly the kind of thing nobody notices until Search Console complains.

import { modelLastmod, newestLastmod } from "../build/lastmod.js";
import { uniqueProviders } from "./catalog.js";
import { shutdownsInYear, shutdownYears, STATUS_HUBS } from "./hubs.js";
import type { Model } from "../schema/model.js";
import {
  ABOUT_PATH,
  CALENDAR_PATH,
  CHANGELOG_PATH,
  modelPagePath,
  providerPagePath,
  shutdownYearPath,
  statusHubPath,
} from "./urls.js";

export interface SitemapEntry {
  path: string;
  priority: string;
  lastmod: string;
}

/**
 * Canonical, indexable HTML pages only. Everything under /api, the badge
 * endpoints, the .md twins and the alias redirects are all deliberately absent:
 * the API subtree and the badges are noindex, the .md twins carry a canonical
 * header pointing at their HTML page, and the aliases canonicalize to the page
 * that owns the answer. A sitemap that lists a noindex URL asks a crawler to
 * fetch something only to be told to forget it.
 */
export function sitemapEntries(
  models: Model[],
  dates: Map<string, string>,
  today: string,
): SitemapEntry[] {
  // An aggregate page is only as fresh as the newest model it lists, so a
  // rebuild that changed nothing does not claim the whole site is new.
  const freshest = (subset: Model[]): string => newestLastmod(subset, dates, today);
  return [
    { path: "/", priority: "1.0", lastmod: freshest(models) },
    { path: CALENDAR_PATH, priority: "0.9", lastmod: freshest(models) },
    { path: CHANGELOG_PATH, priority: "0.8", lastmod: freshest(models) },
    { path: ABOUT_PATH, priority: "0.5", lastmod: freshest(models) },
    ...STATUS_HUBS.map((status) => ({
      path: statusHubPath(status),
      priority: "0.9",
      lastmod: freshest(models),
    })),
    ...shutdownYears(models, today).map((year) => ({
      path: shutdownYearPath(year),
      priority: "0.8",
      lastmod: freshest(shutdownsInYear(models, today, year).map((entry) => entry.model)),
    })),
    ...uniqueProviders(models).map((provider) => ({
      path: providerPagePath(provider),
      priority: "0.9",
      lastmod: freshest(models.filter((model) => model.provider === provider)),
    })),
    ...models.map((model) => ({
      path: modelPagePath(model),
      priority: "0.7",
      lastmod: modelLastmod(model, dates, today),
    })),
  ];
}

export function buildSitemap(
  models: Model[],
  dates: Map<string, string>,
  today: string,
  siteUrl: string,
): string {
  const body = sitemapEntries(models, dates, today)
    .map(
      ({ path, priority, lastmod }) =>
        `  <url><loc>${siteUrl}${path}</loc><lastmod>${lastmod}</lastmod><priority>${priority}</priority></url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
