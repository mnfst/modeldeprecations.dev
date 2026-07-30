// RSS 2.0 for the changelog. Deprecation news arrives in bursts, and a feed is
// how the people who care about it (SDK maintainers, platform teams) find out
// without checking a page.

import { absolute, CHANGELOG_PATH, RSS_PATH } from "./urls.js";
import { changeKindLabel, type ChangeEntry } from "./changelog.js";
import { SITE_DESCRIPTION, SITE_NAME } from "./site.js";

const MAX_ITEMS = 60;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** RFC 822 date, as RSS requires. All-day events are stamped at midnight UTC. */
export function rfc822(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${DAYS[date.getUTCDay()]}, ${dd} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()} 00:00:00 GMT`;
}

export function buildRss(entries: ChangeEntry[], siteUrl: string): string {
  const items = entries.slice(0, MAX_ITEMS).map((entry) => {
    const link = absolute(siteUrl, entry.path);
    return [
      "    <item>",
      `      <title>${escapeXml(entry.title)}</title>`,
      `      <link>${escapeXml(link)}</link>`,
      `      <guid isPermaLink="false">${escapeXml(entry.id)}</guid>`,
      `      <pubDate>${rfc822(entry.date)}</pubDate>`,
      `      <category>${escapeXml(changeKindLabel(entry.kind))}</category>`,
      `      <description>${escapeXml(entry.summary)}</description>`,
      "    </item>",
    ].join("\n");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(`${SITE_NAME} — model deprecation changelog`)}</title>`,
    `    <link>${siteUrl}${CHANGELOG_PATH}</link>`,
    `    <description>${escapeXml(SITE_DESCRIPTION)}</description>`,
    "    <language>en-us</language>",
    `    <atom:link href="${siteUrl}${RSS_PATH}" rel="self" type="application/rss+xml" />`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
