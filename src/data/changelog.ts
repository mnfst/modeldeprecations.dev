// The changelog is derived from the data, not hand-maintained alongside it.
//
// Every lifecycle date in a YAML file *is* a dated event: the day a provider
// announced a deprecation, and the day the model went dark. Deriving the feed
// from those dates means the changelog can never fall out of sync with the pages
// it describes, and a single YAML edit publishes an entry automatically.

import { modelFullLabel, providerLabel } from "./display.js";
import { recommendedReplacement, replacementName } from "./replacements.js";
import { formatDate } from "./status.js";
import { modelPagePath } from "./urls.js";
import type { Model } from "../schema/model.js";

export type ChangeKind = "deprecated" | "shutdown" | "scheduled";

export interface ChangeEntry {
  date: string;
  kind: ChangeKind;
  model: Model;
  title: string;
  summary: string;
  path: string;
  /** Stable id for RSS <guid>. */
  id: string;
}

const KIND_LABELS: Record<ChangeKind, string> = {
  deprecated: "Deprecated",
  shutdown: "Shut down",
  scheduled: "Shutdown scheduled",
};

export function changeKindLabel(kind: ChangeKind): string {
  return KIND_LABELS[kind];
}

function successorPhrase(model: Model, catalog: Model[]): string {
  const recommended = recommendedReplacement(model, catalog);
  if (!recommended) return "";
  return ` Recommended replacement: ${replacementName(model, recommended)}.`;
}

function entry(
  model: Model,
  catalog: Model[],
  date: string,
  kind: ChangeKind,
  summary: string,
): ChangeEntry {
  return {
    date,
    kind,
    model,
    title: `${modelFullLabel(model)} — ${KIND_LABELS[kind].toLowerCase()}`,
    summary: `${summary}${successorPhrase(model, catalog)}`,
    path: modelPagePath(model),
    id: `${model.provider}/${model.model}#${kind}-${date}`,
  };
}

/**
 * Every dated lifecycle event across the catalog, most recent first. Events in
 * the future are included: a shutdown three months out is news now, which is
 * exactly when a reader wants to hear about it.
 */
export function buildChangelog(models: Model[], catalog: Model[] = models): ChangeEntry[] {
  const entries: ChangeEntry[] = [];

  for (const model of models) {
    const who = modelFullLabel(model);
    const provider = providerLabel(model.provider);

    if (model.deprecated_on) {
      entries.push(
        entry(
          model,
          catalog,
          model.deprecated_on,
          "deprecated",
          `${provider} announced the deprecation of ${who}${
            model.shutdown_on ? `, with shutdown set for ${formatDate(model.shutdown_on)}` : ""
          }.`,
        ),
      );
    }
    if (model.shutdown_on) {
      entries.push(
        entry(
          model,
          catalog,
          model.shutdown_on,
          "shutdown",
          `${who} was removed from the ${provider} API. Requests to it now fail.`,
        ),
      );
    } else if (model.earliest_shutdown_on) {
      entries.push(
        entry(
          model,
          catalog,
          model.earliest_shutdown_on,
          "scheduled",
          `${provider} publishes ${formatDate(
            model.earliest_shutdown_on,
          )} as the earliest date ${who} could be retired.`,
        ),
      );
    }
  }

  return entries.sort(
    (a, b) => b.date.localeCompare(a.date) || a.model.name.localeCompare(b.model.name),
  );
}

/** Changelog entries grouped by date, for rendering the page as a dated list. */
export function groupByDate(entries: ChangeEntry[]): { date: string; entries: ChangeEntry[] }[] {
  const groups = new Map<string, ChangeEntry[]>();
  for (const item of entries) {
    const bucket = groups.get(item.date) ?? [];
    bucket.push(item);
    groups.set(item.date, bucket);
  }
  return [...groups.entries()]
    .map(([date, items]) => ({ date, entries: items }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
