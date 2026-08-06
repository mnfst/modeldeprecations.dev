// Day arithmetic and the phrasing of a countdown. Deliberately a leaf module
// with no imports: it is bundled into the client script as well as the build, so
// the browser and the generator produce byte-identical text. Anything that pulls
// in the schema (and with it zod) does not belong here.

const MS_PER_DAY = 86_400_000;

/** Whole days from `from` to `to`. Negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / MS_PER_DAY);
}

/** "in 78 days" / "in 1 day" / "today" / "12 days ago". */
export function relativeDays(days: number): string {
  if (days === 0) return "today";
  const n = Math.abs(days);
  const unit = n === 1 ? "day" : "days";
  return days > 0 ? `in ${n} ${unit}` : `${n} ${unit} ago`;
}

/**
 * The reader's own calendar date as YYYY-MM-DD.
 *
 * Local, not UTC, and on purpose: a visitor in UTC+13 who reads "in 1 day" at
 * breakfast on the shutdown date is being told the wrong thing by exactly the
 * off-by-one that using `toISOString()` here would bake in. The values this is
 * compared against are calendar dates published by providers, so the comparison
 * belongs in the reader's calendar too.
 */
export function localToday(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
