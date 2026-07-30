// What counts as a regression in a citation site.
//
// This site's whole value is that a URL keeps answering and a date keeps being
// true. So the guard blocks the four edits that quietly break that: dropping a
// page, dropping an alias that used to resolve, stripping the source out from
// under a date, and moving a lifecycle date without re-verifying it.
//
// Pure comparison of two catalogs, so the rules are unit-testable without git.

import { modelId, type Model } from "../schema/model.js";

export interface Regression {
  id: string;
  message: string;
}

type DateField = "released_on" | "deprecated_on" | "shutdown_on" | "earliest_shutdown_on";
const DATE_FIELDS: DateField[] = [
  "released_on",
  "deprecated_on",
  "shutdown_on",
  "earliest_shutdown_on",
];

function index(models: Model[]): Map<string, Model> {
  return new Map(models.map((model) => [modelId(model), model]));
}

function removedPages(before: Map<string, Model>, after: Map<string, Model>): Regression[] {
  return [...before.keys()]
    .filter((id) => !after.has(id))
    .map((id) => ({
      id,
      message: `page removed. Its URL is what people cite — keep the entry and update its status instead.`,
    }));
}

function removedAliases(before: Model, after: Model, id: string): Regression[] {
  const kept = new Set(after.aliases);
  return before.aliases
    .filter((alias) => !kept.has(alias))
    .map((alias) => ({
      id,
      message: `alias "${alias}" removed. It resolved to this page; dropping it 404s an id that used to work.`,
    }));
}

function strippedSources(before: Model, after: Model, id: string): Regression[] {
  const hadSources = before.sources.length > 0;
  const stillDated = DATE_FIELDS.some((field) => after[field]);
  if (hadSources && stillDated && after.sources.length === 0) {
    return [
      { id, message: "sources removed while lifecycle dates remain. Every date needs a citation." },
    ];
  }
  return [];
}

function unverifiedDateChanges(before: Model, after: Model, id: string): Regression[] {
  const changed = DATE_FIELDS.filter((field) => before[field] !== after[field]);
  if (changed.length === 0) return [];
  if (after.last_verified > before.last_verified) return [];
  return changed.map((field) => ({
    id,
    message: `${field} changed from ${before[field] ?? "unset"} to ${
      after[field] ?? "unset"
    } without moving last_verified forward. Re-check the source and bump the date.`,
  }));
}

/** Every regression introduced by `after` relative to `before`. */
export function findRegressions(before: Model[], after: Model[]): Regression[] {
  const beforeIndex = index(before);
  const afterIndex = index(after);
  const found = removedPages(beforeIndex, afterIndex);

  for (const [id, previous] of beforeIndex) {
    const current = afterIndex.get(id);
    if (!current) continue;
    found.push(
      ...removedAliases(previous, current, id),
      ...strippedSources(previous, current, id),
      ...unverifiedDateChanges(previous, current, id),
    );
  }
  return found;
}
