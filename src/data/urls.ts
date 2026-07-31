// URL helpers for every surface the build emits. Model pages sit at the site
// root under their provider (`/openai/gpt-4-32k`) because the shortest honest
// URL is the one people paste into an answer.

import { modelId, type Model } from "../schema/model.js";

type ModelRef = Pick<Model, "provider" | "model">;

/** Canonical HTML page for one model, e.g. /openai/gpt-4-32k. */
export function modelPagePath(model: ModelRef): string {
  return `/${modelId(model)}`;
}

/** The same page as Markdown, for agents that would rather not parse HTML. */
export function modelMarkdownPath(model: ModelRef): string {
  return `/${modelId(model)}.md`;
}

/** Provider hub, e.g. /openai. */
export function providerPagePath(provider: string): string {
  return `/${provider}`;
}

export const CALENDAR_PATH = "/calendar";
export const CHANGELOG_PATH = "/changelog";
export const API_PATH = "/api";
export const ABOUT_PATH = "/about";
export const ICS_PATH = "/calendar.ics";
export const RSS_PATH = "/changelog.xml";

/** Cross-provider lifecycle hub, e.g. /deprecated. */
export function statusHubPath(status: string): string {
  return `/${status}`;
}

/** Everything shutting down in one year, e.g. /shutdowns/2027. */
export function shutdownYearPath(year: string): string {
  return `/shutdowns/${year}`;
}

/** Static JSON for one model. */
export function modelJsonPath(model: ModelRef): string {
  return `/api/v1/models/${modelId(model)}.json`;
}

/** shields.io endpoint JSON, so a README badge is one URL away. */
export function badgeJsonPath(model: ModelRef): string {
  return `/badge/${modelId(model)}.json`;
}

/** The sibling site's page for the same model — "what parameters does it take?". */
export function siblingModelUrl(siblingUrl: string, model: ModelRef): string {
  return `${siblingUrl}/models/${modelId(model)}`;
}

/**
 * Social-share image for a page, mirroring the page's own URL:
 * /openai/gpt-4-32k → /assets/og/openai/gpt-4-32k.png.
 */
export function ogImagePath(pagePath: string): string {
  return pagePath === "/" ? "/assets/og/home.png" : `/assets/og${pagePath}.png`;
}

/** Join the site origin with a root-relative path. */
export function absolute(siteUrl: string, pathname: string): string {
  return `${siteUrl}${pathname}`;
}

/** Paths the site owns at the root, which therefore can never be provider slugs. */
export const RESERVED_ROOT_SEGMENTS = new Set([
  "about",
  "api",
  "assets",
  "badge",
  "calendar",
  "calendar.ics",
  "changelog",
  "changelog.xml",
  "deprecated",
  "llms.txt",
  "llms-full.txt",
  "retired",
  "robots.txt",
  "shutdowns",
  "sitemap.xml",
  "404",
  "index",
]);
