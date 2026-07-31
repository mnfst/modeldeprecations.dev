// Per-page social-share images. Every page gets its own 1200×630 PNG built from
// the same data the page renders, so a shared link previews with the model's
// real name, status and shutdown date instead of one generic site card.
//
// Rasterization is deterministic: resvg renders with the three vendored Outfit
// TTFs and `loadSystemFonts: false`, so output never depends on the build machine.

import fs from "node:fs/promises";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { upcomingShutdowns } from "../data/catalog.js";
import { modelFullLabel, providerLabel } from "../data/display.js";
import {
  deprecatedEntries,
  retiredEntries,
  scheduledEntries,
  shutdownsInYear,
  shutdownYears,
  STATUS_HUBS,
  type StatusHub,
} from "../data/hubs.js";
import { CLIENT_DIR, DIST_ASSETS_DIR, DIST_DIR } from "../data/paths.js";
import { recommendedReplacement } from "../data/replacements.js";
import { formatDate, lifecycle, relativeDays, STATUS_LABELS } from "../data/status.js";
import {
  ABOUT_PATH,
  API_PATH,
  CALENDAR_PATH,
  CHANGELOG_PATH,
  modelPagePath,
  ogImagePath,
  providerPagePath,
  shutdownYearPath,
  statusHubPath,
} from "../data/urls.js";
import type { Model } from "../schema/model.js";
import { renderOgCard, type OgCard } from "./og-card.js";

const FONT_FILES = ["outfit-400.ttf", "outfit-600.ttf", "outfit-700.ttf"].map((name) =>
  path.join(CLIENT_DIR, "fonts", name),
);

function toPng(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: "Outfit" },
    fitTo: { mode: "width", value: 1200 },
  });
  return Buffer.from(resvg.render().asPng());
}

export function homeCard(models: Model[], today: string): OgCard {
  const soon = upcomingShutdowns(models, today).filter(
    (entry) => (entry.life.daysToShutdown ?? -1) >= 0,
  );
  return {
    headline: "Which AI models are being shut down?",
    subline: `${models.length} models tracked · ${soon.length} shutdowns still ahead · every date sourced`,
    chips: soon.slice(0, 3).map((entry) => entry.model.model),
  };
}

export function modelCard(model: Model, catalog: Model[], today: string): OgCard {
  const life = lifecycle(model, today);
  const recommended = recommendedReplacement(model, catalog);

  // Branch on status first, then on whether a date exists. Leading with the date
  // let a retired model with no recoverable shutdown day fall through to the
  // active wording, which put "Not deprecated" next to a red RETIRED pill on the
  // one image that gets shared into a feed.
  let subline: string;
  if (life.status === "retired") {
    subline = life.shutdown
      ? `Shut down ${formatDate(life.shutdown)}`
      : "Retired · shutdown date not published";
  } else if (life.status === "deprecated") {
    subline = life.shutdown
      ? `${life.soft ? "Shutdown no sooner than" : "Shuts down"} ${formatDate(life.shutdown)}${
          life.daysToShutdown === undefined ? "" : ` · ${relativeDays(life.daysToShutdown)}`
        }`
      : "Deprecated · no shutdown date published";
  } else if (life.shutdown) {
    subline = `Shutdown no sooner than ${formatDate(life.shutdown)}${
      life.daysToShutdown === undefined ? "" : ` · ${relativeDays(life.daysToShutdown)}`
    }`;
  } else {
    subline = `Not deprecated · verified ${formatDate(model.last_verified)}`;
  }

  // The chip is worded, not glyphed: cards are rasterized with the vendored
  // Outfit subset and `loadSystemFonts: false`, and that subset has no U+2192,
  // so an arrow renders as a tofu box on every card that has a successor.
  // Shown only when it really is a successor — an alternative listed on a live
  // model must not read as a migration instruction.
  const showSuccessor = recommended && (life.status !== "active" || recommended.ref.recommended);

  return {
    eyebrow: providerLabel(model.provider),
    headline: model.name,
    status: STATUS_LABELS[life.status],
    subline,
    chips: showSuccessor ? [`Use ${recommended!.ref.model}`] : [],
  };
}

export function providerCard(provider: string, models: Model[], today: string): OgCard {
  const counts = { active: 0, deprecated: 0, retired: 0 };
  for (const model of models) counts[lifecycle(model, today).status] += 1;
  return {
    eyebrow: "Provider",
    headline: `${providerLabel(provider)} model deprecations`,
    subline: `${counts.deprecated} deprecated · ${counts.retired} retired · ${counts.active} active`,
  };
}

export function calendarCard(models: Model[], today: string): OgCard {
  const soon = upcomingShutdowns(models, today).filter(
    (entry) => (entry.life.daysToShutdown ?? -1) >= 0,
  );
  const next = soon[0];
  return {
    eyebrow: "Calendar",
    headline: "AI model shutdown calendar",
    subline: next
      ? `Next: ${modelFullLabel(next.model)} on ${formatDate(next.life.shutdown)} · subscribable .ics`
      : "Every announced shutdown date · subscribable .ics",
  };
}

export function changelogCard(count: number): OgCard {
  return {
    eyebrow: "Changelog",
    headline: "Model deprecation changelog",
    subline: `${count} dated deprecation and shutdown events · RSS`,
  };
}

export function apiCard(modelCount: number): OgCard {
  return {
    eyebrow: "Documentation",
    headline: "modeldeprecations.dev API",
    subline: `${modelCount} models · static JSON · CORS-enabled · MIT licensed`,
  };
}

export function statusHubCard(status: StatusHub, count: number, today: string): OgCard {
  return status === "deprecated"
    ? {
        eyebrow: "Every provider",
        headline: "Deprecated AI models",
        status: STATUS_LABELS.deprecated,
        subline: `${count} announced for retirement · shutdown date and replacement for each`,
      }
    : {
        eyebrow: "Every provider",
        headline: "Retired AI models",
        status: STATUS_LABELS.retired,
        subline: `${count} already shut down · verified ${formatDate(today)}`,
      };
}

export function yearHubCard(year: string, entries: { model: Model }[]): OgCard {
  return {
    eyebrow: "Shutdowns",
    headline: `AI models shutting down in ${year}`,
    subline: `${entries.length} model${entries.length === 1 ? "" : "s"} lose API access · every date sourced`,
    chips: entries.slice(0, 3).map((entry) => entry.model.model),
  };
}

export function aboutCard(modelCount: number, providerCount: number): OgCard {
  return {
    eyebrow: "About",
    headline: "How this catalog is built",
    subline: `${modelCount} models · ${providerCount} providers · every date cited to the provider's docs`,
  };
}

/** Writes one card to the dist path that `ogImagePath` advertises for `pagePath`. */
async function writeCard(pagePath: string, card: OgCard): Promise<void> {
  const file = path.join(DIST_DIR, ogImagePath(pagePath).replace(/^\//, ""));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, toPng(renderOgCard(card)));
}

/**
 * Generates every page's card plus the site-wide default at /assets/og.png,
 * which stays the fallback for any surface without a page of its own.
 */
export async function writeOgImages(
  models: Model[],
  providers: string[],
  changelogCount: number,
  today: string,
): Promise<number> {
  await fs.mkdir(DIST_ASSETS_DIR, { recursive: true });
  const home = homeCard(models, today);
  await fs.writeFile(path.join(DIST_ASSETS_DIR, "og.png"), toPng(renderOgCard(home)));

  await writeCard("/", home);
  await writeCard(CALENDAR_PATH, calendarCard(models, today));
  await writeCard(CHANGELOG_PATH, changelogCard(changelogCount));
  await writeCard(API_PATH, apiCard(models.length));
  await writeCard(ABOUT_PATH, aboutCard(models.length, providers.length));

  for (const status of STATUS_HUBS) {
    const count =
      status === "deprecated"
        ? deprecatedEntries(models, today).length + scheduledEntries(models, today).length
        : retiredEntries(models, today).length;
    await writeCard(statusHubPath(status), statusHubCard(status, count, today));
  }

  const years = shutdownYears(models, today);
  for (const year of years) {
    await writeCard(shutdownYearPath(year), yearHubCard(year, shutdownsInYear(models, today, year)));
  }

  for (const provider of providers) {
    const owned = models.filter((model) => model.provider === provider);
    await writeCard(providerPagePath(provider), providerCard(provider, owned, today));
  }
  for (const model of models) {
    await writeCard(modelPagePath(model), modelCard(model, models, today));
  }

  return 5 + STATUS_HUBS.length + years.length + providers.length + models.length;
}
