// Cross-provider hub pages: /deprecated, /retired and /shutdowns/<year>.
//
// The catalog already answers "is this one model deprecated?" on 156 pages and
// "what is this one provider retiring?" on three. These cover the queries that
// name neither — "deprecated AI models", "what LLMs shut down in 2027" — which
// the homepage could only serve by making someone filter a table by hand.
//
// One renderer for both shapes because they are the same page: a titled slice of
// the catalog, a table per section, and links onward to the neighbouring slices.

import path from "node:path";
import ejs from "ejs";
import type { Timed } from "../data/catalog.js";
import {
  deprecatedEntries,
  retiredEntries,
  scheduledEntries,
  shutdownsInYear,
  shutdownYears,
  type StatusHub,
} from "../data/hubs.js";
import { VIEWS_DIR } from "../data/paths.js";
import { SITE_NAME, SITE_URL } from "../data/site.js";
import { formatDate } from "../data/status.js";
import {
  absolute,
  CALENDAR_PATH,
  ogImagePath,
  shutdownYearPath,
  statusHubPath,
} from "../data/urls.js";
import type { Model } from "../schema/model.js";
import { fitDescription, fitTitle } from "./meta.js";
import { buildHubStructuredData } from "./structured-data.js";
import { hubLinks, renderShell, viewHelpers } from "./render.js";

interface HubSection {
  key: string;
  title: string;
  blurb: string;
  rows: Timed[];
}

interface RelatedLink {
  href: string;
  label: string;
  blurb: string;
}

export function statusHubTitle(status: StatusHub): string {
  return status === "deprecated"
    ? fitTitle([
        `Deprecated AI models — every shutdown date & replacement`,
        `Deprecated AI models — shutdown dates`,
        `Deprecated AI models`,
      ])
    : fitTitle([
        `Retired AI models — shutdown dates & replacements`,
        `Retired AI models — what replaced them`,
        `Retired AI models`,
      ]);
}

export function statusHubDescription(status: StatusHub, count: number, today: string): string {
  if (status === "deprecated") {
    return fitDescription([
      `Every AI model a provider has announced it is retiring — ${count} of them — with the shutdown date and the replacement, each cited to the provider's docs.`,
      `Every AI model announced for retirement: ${count} models, with shutdown dates and replacements.`,
      `${count} AI models are deprecated. Shutdown dates and replacements for each.`,
    ]);
  }
  return fitDescription([
    `Every AI model that has already been shut down — ${count} of them — with the date API access ended and what its provider says to use instead. As of ${today}.`,
    `Every AI model that has already been shut down: ${count} models, with the date and the replacement.`,
    `${count} AI models have been retired. The date each stopped answering, and what replaced it.`,
  ]);
}

export function yearHubTitle(year: string): string {
  return fitTitle([
    `AI models shutting down in ${year} — every date & replacement`,
    `AI models shutting down in ${year} — every date`,
    `AI models shutting down in ${year}`,
  ]);
}

export function yearHubDescription(year: string, entries: Timed[]): string {
  const first = entries[0];
  const opener = first?.life.shutdown
    ? ` First out: ${first.model.name} on ${formatDate(first.life.shutdown)}.`
    : "";
  return fitDescription([
    `${entries.length} AI models lose API access in ${year}. Every shutdown date in order, with the replacement each provider names.${opener}`,
    `${entries.length} AI models lose API access in ${year}. Every shutdown date in order, with replacements.`,
    `${entries.length} AI models shut down in ${year}.`,
  ]);
}

/** Year cards, newest first, minus whichever year is being rendered. */
function yearLinks(years: string[], exclude?: string): RelatedLink[] {
  return years
    .filter((year) => year !== exclude)
    .reverse()
    .map((year) => ({
      href: shutdownYearPath(year),
      label: `Shutdowns in ${year}`,
      blurb: `Every model whose API access ends during ${year}.`,
    }));
}

const STATUS_LINKS: Record<StatusHub, RelatedLink> = {
  deprecated: {
    href: statusHubPath("deprecated"),
    label: "Deprecated models",
    blurb: "Announced for retirement, still answering for now.",
  },
  retired: {
    href: statusHubPath("retired"),
    label: "Retired models",
    blurb: "Already gone. Requests to these fail.",
  },
};

const CALENDAR_LINK: RelatedLink = {
  href: CALENDAR_PATH,
  label: "Shutdown calendar",
  blurb: "Every date in order, subscribable as .ics.",
};

/**
 * A deprecation hub carries two tables. The second one exists because a model
 * can carry a retirement date without being deprecated, and collapsing the two
 * into one list would say something the provider did not.
 */
function statusSections(status: StatusHub, models: Model[], today: string): HubSection[] {
  if (status === "retired") {
    return [
      {
        key: "retired",
        title: "Retired",
        blurb: "API access has ended. Requests to these model ids now return an error.",
        rows: retiredEntries(models, today),
      },
    ];
  }
  return [
    {
      key: "deprecated",
      title: "Deprecated",
      blurb:
        "The provider has announced these are going away. They still answer requests until the date lands.",
      rows: deprecatedEntries(models, today),
    },
    {
      key: "scheduled",
      title: "Not deprecated, but dated",
      blurb:
        "Fully supported models their provider has already put a retirement date on. That is a schedule, not a deprecation — but it is a date worth planning around.",
      rows: scheduledEntries(models, today),
    },
  ].filter((section) => section.rows.length > 0);
}

function statusIntro(status: StatusHub, count: number, today: string): string {
  return status === "deprecated"
    ? `Every model across every provider we track that has been announced for retirement, most urgent first. ${count} in total, current as of ${formatDate(today)}. Each links to the page that cites the provider doc the date came from.`
    : `Every model we track that has already stopped answering, most recently retired first. ${count} in total, current as of ${formatDate(today)}. If your code still names one of these, it is already failing.`;
}

export async function renderStatusHubPage(
  status: StatusHub,
  models: Model[],
  today: string,
): Promise<string> {
  const sections = statusSections(status, models, today);
  const rows = sections.flatMap((section) => section.rows);
  const heading = status === "deprecated" ? "Deprecated AI models" : "Retired AI models";
  const pathname = statusHubPath(status);
  const description = statusHubDescription(status, rows.length, today);

  return renderShell(
    {
      title: statusHubTitle(status),
      description,
      canonicalUrl: absolute(SITE_URL, pathname),
      ogImage: ogImagePath(pathname),
      structuredData: buildHubStructuredData(
        heading,
        description,
        rows,
        [{ name: heading, path: pathname }],
        SITE_URL,
        today,
      ),
      providerHubs: hubLinks(models, today),
    },
    await renderHubBody({
      heading,
      intro: statusIntro(status, rows.length, today),
      sections,
      related: [
        STATUS_LINKS[status === "deprecated" ? "retired" : "deprecated"],
        CALENDAR_LINK,
        ...yearLinks(shutdownYears(models, today)),
      ],
    }),
  );
}

function yearIntro(year: string, count: number, today: string): string {
  const tense = year < today.slice(0, 4) ? "lost" : "lose";
  return `${count} model${count === 1 ? "" : "s"} ${tense} API access during ${year}, across every provider we track. In date order, with the replacement each provider names. Every date is cited on the model's own page.`;
}

export async function renderYearHubPage(
  year: string,
  models: Model[],
  today: string,
): Promise<string> {
  const rows = shutdownsInYear(models, today, year);
  const heading = `AI models shutting down in ${year}`;
  const pathname = shutdownYearPath(year);
  const description = yearHubDescription(year, rows);

  return renderShell(
    {
      title: yearHubTitle(year),
      description,
      canonicalUrl: absolute(SITE_URL, pathname),
      ogImage: ogImagePath(pathname),
      structuredData: buildHubStructuredData(
        heading,
        description,
        rows,
        [
          { name: "Shutdowns", path: CALENDAR_PATH },
          { name: year, path: pathname },
        ],
        SITE_URL,
        today,
      ),
      providerHubs: hubLinks(models, today),
    },
    await renderHubBody({
      heading,
      intro: yearIntro(year, rows.length, today),
      sections: [
        {
          key: `shutdowns-${year}`,
          title: `${year} shutdowns`,
          blurb:
            "Ordered by the day API access ends. A date marked earliest is the soonest a provider says it could retire the model, not a commitment.",
          rows,
        },
      ],
      related: [
        ...yearLinks(shutdownYears(models, today), year),
        STATUS_LINKS.deprecated,
        STATUS_LINKS.retired,
        CALENDAR_LINK,
      ],
      // "Shutdowns" points at the calendar: it is the page that owns every date,
      // and there is deliberately no bare /shutdowns index to send people to.
      crumbs: [
        { name: "Home", href: "/" },
        { name: "Shutdowns", href: CALENDAR_PATH },
        { name: year },
      ],
    }),
  );
}

async function renderHubBody(opts: {
  heading: string;
  intro: string;
  sections: HubSection[];
  related: RelatedLink[];
  crumbs?: { name: string; href?: string }[];
}): Promise<string> {
  return ejs.renderFile(path.join(VIEWS_DIR, "hub.ejs"), {
    heading: opts.heading,
    intro: opts.intro,
    sections: opts.sections,
    related: opts.related,
    crumbs: opts.crumbs ?? [{ name: "Home", href: "/" }, { name: opts.heading }],
    helpers: viewHelpers,
  });
}

export { SITE_NAME };
