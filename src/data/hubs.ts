// Cross-provider hubs: the same catalog sliced by lifecycle state and by the
// year a model stops answering, rather than by who made it.
//
// The provider hubs answer "what is OpenAI retiring?". These answer "what is
// retired?" and "what breaks in 2027?" — questions people ask without a provider
// in mind, and which the homepage table can only answer by being filtered by
// hand. Pure functions of (models, today) like every other data module here, so
// the pages, the sitemap and the tests all read the same slice.

import { withLifecycle, type Timed } from "./catalog.js";
import { urgencyRank } from "./status.js";
import type { Model } from "../schema/model.js";

/** The lifecycle states worth a hub of their own. */
export type StatusHub = "deprecated" | "retired";

export const STATUS_HUBS: StatusHub[] = ["deprecated", "retired"];

const byName = (a: Timed, b: Timed): number => a.model.name.localeCompare(b.model.name);

/** Deprecated and still answering, most urgent first. */
export function deprecatedEntries(models: Model[], today: string): Timed[] {
  return withLifecycle(models, today)
    .filter((entry) => entry.life.status === "deprecated")
    .sort((a, b) => urgencyRank(a.life) - urgencyRank(b.life) || byName(a, b));
}

/**
 * Active models the provider has already put a shutdown date on. They are not
 * deprecated and the site is careful never to say they are — but someone reading
 * a deprecation hub wants to know a date exists, so they get their own section.
 */
export function scheduledEntries(models: Model[], today: string): Timed[] {
  return withLifecycle(models, today)
    .filter((entry) => entry.life.scheduled)
    .sort((a, b) => urgencyRank(a.life) - urgencyRank(b.life) || byName(a, b));
}

/** Already gone, most recently retired first. */
export function retiredEntries(models: Model[], today: string): Timed[] {
  return withLifecycle(models, today)
    .filter((entry) => entry.life.status === "retired")
    .sort((a, b) => (b.life.shutdown ?? "").localeCompare(a.life.shutdown ?? "") || byName(a, b));
}

/** Every model whose shutdown lands in `year`, earliest first. */
export function shutdownsInYear(models: Model[], today: string, year: string): Timed[] {
  return withLifecycle(models, today)
    .filter((entry) => entry.life.shutdown?.startsWith(`${year}-`))
    .sort((a, b) => (a.life.shutdown ?? "").localeCompare(b.life.shutdown ?? "") || byName(a, b));
}

/**
 * The years the catalog actually has shutdowns in, ascending. Derived rather
 * than hardcoded so a year hub can never exist with nothing on it, and so the
 * next one appears the day a date lands in it.
 */
export function shutdownYears(models: Model[], today: string): string[] {
  const years = new Set<string>();
  for (const entry of withLifecycle(models, today)) {
    if (entry.life.shutdown) years.add(entry.life.shutdown.slice(0, 4));
  }
  return [...years].sort();
}
