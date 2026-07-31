import path from "node:path";
import ejs from "ejs";
import {
  buildProviderFacets,
  pastShutdowns,
  upcomingShutdowns,
  withLifecycle,
  type ProviderFacet,
} from "../data/catalog.js";
import { answerHeadline } from "../data/answer.js";
import { modelFullLabel, providerLabel, sourceHost } from "../data/display.js";
import { shutdownYears } from "../data/hubs.js";
import { usageGuideMarkdown } from "../data/llms.js";
import { logoFor } from "../data/logos.js";
import { VIEWS_DIR } from "../data/paths.js";
import { formatDate, lifecycle, relativeDays, statusPill, STATUS_LABELS } from "../data/status.js";
import { analyticsEnabled, OG_IMAGE_PATH, SITE_NAME, SITE_URL } from "../data/site.js";
import {
  absolute,
  CALENDAR_PATH,
  CHANGELOG_PATH,
  modelPagePath,
  ogImagePath,
  providerPagePath,
} from "../data/urls.js";
import { modelId, type Model } from "../schema/model.js";
import { fitDescription, fitTitle } from "./meta.js";
import { buildHomeStructuredData } from "./structured-data.js";

const LAYOUT_PATH = path.join(VIEWS_DIR, "layout.ejs");

/** Helpers exposed to every EJS view. */
export const viewHelpers = {
  modelId,
  modelFullLabel,
  providerLabel,
  sourceHost,
  logoFor,
  lifecycle,
  statusPill,
  statusLabel: (status: string): string => STATUS_LABELS[status as keyof typeof STATUS_LABELS],
  formatDate,
  relativeDays,
  answerHeadline,
  modelPagePath,
  providerPagePath,
};

export interface HubLink {
  href: string;
  label: string;
  provider: string;
  count: number;
}

/** Sitewide footer/menu links to each provider hub, ordered by model count. */
export function hubLinks(models: Model[], today: string): HubLink[] {
  return buildProviderFacets(models, today).map((facet) => ({
    href: providerPagePath(facet.provider),
    label: providerLabel(facet.provider),
    provider: facet.provider,
    count: facet.count,
  }));
}

export interface ShellMeta {
  title: string;
  description: string;
  canonicalUrl: string;
  structuredData: string;
  providerHubs: HubLink[];
  /** Root-relative path of this page's share image; falls back to the site card. */
  ogImage?: string;
  /** og:type — "website" for hubs, "article" for the content pages. */
  ogType?: string;
  /** Robots directive; omitted (index, follow) for every indexable page. */
  robots?: string;
  /** Root-relative Markdown twin, advertised to agents via <link rel="alternate">. */
  markdownUrl?: string;
  /** Overrides the environment default; tests pin it rather than set VERCEL. */
  analytics?: boolean;
}

/** Wrap a rendered body in the shared HTML layout. */
export async function renderShell(meta: ShellMeta, body: string): Promise<string> {
  return ejs.renderFile(LAYOUT_PATH, {
    title: meta.title,
    description: meta.description,
    canonicalUrl: meta.canonicalUrl,
    structuredData: meta.structuredData,
    ogImageUrl: absolute(SITE_URL, meta.ogImage ?? OG_IMAGE_PATH),
    ogType: meta.ogType ?? "website",
    robots: meta.robots ?? "",
    markdownUrl: meta.markdownUrl ?? "",
    providerHubs: meta.providerHubs,
    helpers: viewHelpers,
    usageGuide: usageGuideMarkdown(SITE_URL),
    analytics: meta.analytics ?? analyticsEnabled(),
    body,
  });
}

/**
 * Brand-first homepage title. Interior pages read "<page> · modeldeprecations.dev";
 * the homepage inverts that so the brand leads, which is what a branded search and
 * a link in a feed both want to see first.
 */
export function homeTitle(modelCount: number): string {
  return fitTitle([
    `AI Model Deprecations — ${modelCount} Models, Shutdown Dates`,
    `AI Model Deprecations — Shutdown Dates & Replacements`,
    `AI Model Deprecations & Shutdown Dates`,
  ]);
}

export function homeDescription(modelCount: number, upcoming: number, providerCount: number): string {
  const lead = "Is your model deprecated?";
  const reach = `${modelCount} models from ${providerCount} providers`;
  return fitDescription([
    `${lead} Shutdown dates and replacements for ${reach}, every date cited to the provider's own docs. ${upcoming} shutdowns still ahead.`,
    `${lead} Shutdown dates and replacements for ${reach}, every date cited to the provider's docs.`,
    `${lead} Shutdown dates and replacements for ${reach}.`,
  ]);
}

export interface IndexOptions {
  models: Model[];
  today: string;
  analytics?: boolean;
}

export async function renderIndex(opts: IndexOptions): Promise<string> {
  const { models, today } = opts;
  const upcoming = upcomingShutdowns(models, today).filter(
    (entry) => (entry.life.daysToShutdown ?? -1) >= 0,
  );
  const facets = buildProviderFacets(models, today);

  const body = await ejs.renderFile(path.join(VIEWS_DIR, "index.ejs"), {
    rows: withLifecycle(models, today),
    upcoming,
    recent: pastShutdowns(models, today).slice(0, 8),
    facets,
    years: shutdownYears(models, today),
    today,
    calendarPath: CALENDAR_PATH,
    changelogPath: CHANGELOG_PATH,
    helpers: viewHelpers,
  });

  const description = homeDescription(models.length, upcoming.length, facets.length);
  return renderShell(
    {
      title: homeTitle(models.length),
      description,
      canonicalUrl: `${SITE_URL}/`,
      ogImage: ogImagePath("/"),
      structuredData: buildHomeStructuredData(
        models,
        SITE_URL,
        absolute(SITE_URL, OG_IMAGE_PATH),
        today,
      ),
      providerHubs: hubLinks(models, today),
      analytics: opts.analytics,
    },
    body,
  );
}

export { SITE_NAME };
