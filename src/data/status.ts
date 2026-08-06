// Date arithmetic and the vocabulary the site uses to talk about a lifecycle.
// Pure functions of (model, today) so every countdown on the site is reproducible
// and testable — nothing here reads the clock on its own.

import {
  isSoftShutdown,
  shutdownDate,
  statusOn,
  type Model,
  type Status,
} from "../schema/model.js";

// The day arithmetic itself lives in a leaf module because the client bundle
// needs it too — see src/data/relative-time.ts. Imported and re-exported here so
// every existing caller keeps importing the vocabulary from one place.
import { daysBetween, relativeDays } from "./relative-time.js";

export { daysBetween, relativeDays };

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2025-06-06" → "June 6, 2025". Returns "" for a missing date. */
export function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

export const STATUS_LABELS: Record<Status, string> = {
  active: "Active",
  deprecated: "Deprecated",
  retired: "Retired",
};

export interface Lifecycle {
  status: Status;
  /** The date the page counts down to, committed or estimated. */
  shutdown?: string;
  /** True when the provider called the date an estimate, not a commitment. */
  soft: boolean;
  /** Days until shutdown; negative once it has passed. Undefined without a date. */
  daysToShutdown?: number;
  /** An active model whose provider has already published a shutdown date. */
  scheduled: boolean;
  /** Deprecated, but the provider has not published any shutdown date. */
  dateUnconfirmed: boolean;
}

/** Everything the templates need to describe where a model is in its life. */
export function lifecycle(model: Model, today: string): Lifecycle {
  const status = statusOn(model, today);
  const shutdown = shutdownDate(model);
  return {
    status,
    shutdown,
    soft: isSoftShutdown(model),
    daysToShutdown: shutdown ? daysBetween(today, shutdown) : undefined,
    scheduled: status === "active" && Boolean(shutdown),
    dateUnconfirmed: status === "deprecated" && !shutdown,
  };
}

/** Pill text: "Retired", "Deprecated", "Active", "Shutdown scheduled". */
export function statusPill(life: Lifecycle): string {
  return life.scheduled ? "Shutdown scheduled" : STATUS_LABELS[life.status];
}

/** Sort key that puts the most urgent models first: soonest shutdown, then name. */
export function urgencyRank(life: Lifecycle): number {
  if (life.status === "retired") return Number.MAX_SAFE_INTEGER;
  if (life.daysToShutdown === undefined) return Number.MAX_SAFE_INTEGER - 1;
  return life.daysToShutdown;
}
