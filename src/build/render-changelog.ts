import path from "node:path";
import ejs from "ejs";
import { changeKindLabel, groupByDate, type ChangeEntry } from "../data/changelog.js";
import { VIEWS_DIR } from "../data/paths.js";
import { SITE_NAME, SITE_URL } from "../data/site.js";
import { absolute, CHANGELOG_PATH, ogImagePath, RSS_PATH } from "../data/urls.js";
import type { Model } from "../schema/model.js";
import { fitDescription, fitTitle } from "./meta.js";
import { buildChangelogStructuredData } from "./structured-data.js";
import { hubLinks, renderShell, viewHelpers } from "./render.js";

export function changelogPageTitle(): string {
  return fitTitle([
    `AI model deprecation changelog — dated · ${SITE_NAME}`,
    "AI model deprecation changelog — dated",
    "AI model deprecation changelog",
  ]);
}

export function changelogPageDescription(entries: ChangeEntry[]): string {
  const latest = entries[0];
  const lead = "Every AI model deprecation announcement and shutdown, dated, with an RSS feed.";
  const recent = latest ? ` Latest: ${latest.title} (${latest.date}).` : "";
  return fitDescription([`${lead}${recent}`, lead]);
}

export async function renderChangelogPage(
  entries: ChangeEntry[],
  models: Model[],
  today: string,
): Promise<string> {
  const body = await ejs.renderFile(path.join(VIEWS_DIR, "changelog.ejs"), {
    groups: groupByDate(entries).slice(0, 80),
    total: entries.length,
    rssPath: RSS_PATH,
    changeKindLabel,
    today,
    helpers: viewHelpers,
  });

  const description = changelogPageDescription(entries);
  return renderShell(
    {
      title: changelogPageTitle(),
      description,
      canonicalUrl: absolute(SITE_URL, CHANGELOG_PATH),
      ogImage: ogImagePath(CHANGELOG_PATH),
      structuredData: buildChangelogStructuredData(entries, description, SITE_URL),
      providerHubs: hubLinks(models, today),
    },
    body,
  );
}
