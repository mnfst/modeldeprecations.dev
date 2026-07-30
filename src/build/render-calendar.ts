import path from "node:path";
import ejs from "ejs";
import { pastShutdowns, upcomingShutdowns, type Timed } from "../data/catalog.js";
import { VIEWS_DIR } from "../data/paths.js";
import { SITE_NAME, SITE_URL } from "../data/site.js";
import { formatDate } from "../data/status.js";
import { absolute, CALENDAR_PATH, ICS_PATH, ogImagePath } from "../data/urls.js";
import type { Model } from "../schema/model.js";
import { fitDescription, fitTitle } from "./meta.js";
import { buildCalendarStructuredData } from "./structured-data.js";
import { hubLinks, renderShell, viewHelpers } from "./render.js";

export function calendarPageTitle(): string {
  return fitTitle([
    `AI model shutdown calendar — every date · ${SITE_NAME}`,
    "AI model shutdown calendar — every date",
    "AI model shutdown calendar",
  ]);
}

export function calendarPageDescription(upcoming: Timed[], today: string): string {
  const next = upcoming.find((entry) => (entry.life.daysToShutdown ?? -1) >= 0);
  const lead = "Every announced AI model shutdown date, in order, with a subscribable calendar feed.";
  const soonest = next?.life.shutdown
    ? ` Next: ${next.model.name} on ${formatDate(next.life.shutdown)}.`
    : "";
  return fitDescription([`${lead}${soonest} As of ${today}.`, `${lead}${soonest}`, lead]);
}

/** Groups shutdowns by calendar month, which is how a reader plans around them. */
export function groupByMonth(entries: Timed[]): { month: string; label: string; entries: Timed[] }[] {
  const groups = new Map<string, Timed[]>();
  for (const entry of entries) {
    const month = (entry.life.shutdown ?? "").slice(0, 7);
    if (!month) continue;
    groups.set(month, [...(groups.get(month) ?? []), entry]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, items]) => ({
      month,
      label: formatDate(`${month}-01`).replace(/ \d+,/, ""),
      entries: items,
    }));
}

export async function renderCalendarPage(models: Model[], today: string): Promise<string> {
  const upcoming = upcomingShutdowns(models, today).filter(
    (entry) => (entry.life.daysToShutdown ?? -1) >= 0,
  );
  const past = pastShutdowns(models, today);

  const body = await ejs.renderFile(path.join(VIEWS_DIR, "calendar.ejs"), {
    months: groupByMonth(upcoming),
    past,
    upcomingCount: upcoming.length,
    icsPath: ICS_PATH,
    today,
    helpers: viewHelpers,
  });

  const description = calendarPageDescription(upcoming, today);
  return renderShell(
    {
      title: calendarPageTitle(),
      description,
      canonicalUrl: absolute(SITE_URL, CALENDAR_PATH),
      ogImage: ogImagePath(CALENDAR_PATH),
      structuredData: buildCalendarStructuredData([...upcoming, ...past], description, SITE_URL),
      providerHubs: hubLinks(models, today),
    },
    body,
  );
}
