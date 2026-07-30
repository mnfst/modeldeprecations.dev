// An iCalendar feed of every model shutdown. Subscribing to it puts each
// retirement on the reader's own calendar months ahead of the date, which is the
// one thing a static table can't do — and the reason to link this page at all.
//
// Events are all-day (DATE values) because a shutdown is a day, not a moment,
// and providers never publish a time.

import { modelFullLabel, providerLabel } from "./display.js";
import { recommendedReplacement } from "./replacements.js";
import { shutdownDate, type Model } from "../schema/model.js";
import { absolute, modelPagePath } from "./urls.js";

const PRODID = "-//modeldeprecations.dev//Model shutdowns//EN";

/** RFC 5545 escaping for TEXT values: backslash, semicolon, comma, newline. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * RFC 5545 caps content lines at 75 *octets*, not characters, and continuations
 * start with a single space. Model names carry em dashes and arrows, so the
 * limit is measured in UTF-8 bytes and a character is never split across lines.
 */
export function fold(line: string, maxOctets = 73): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= maxOctets) return line;

  const parts: string[] = [];
  let current = "";
  let octets = 0;
  let budget = maxOctets;

  for (const char of line) {
    const size = encoder.encode(char).length;
    if (octets + size > budget) {
      parts.push(current);
      current = "";
      octets = 0;
      // Continuation lines spend one octet on the leading space.
      budget = maxOctets - 1;
    }
    current += char;
    octets += size;
  }
  if (current.length > 0) parts.push(current);

  return parts.map((part, index) => (index === 0 ? part : ` ${part}`)).join("\r\n");
}

function compact(iso: string): string {
  return iso.replace(/-/g, "");
}

/** The day after the shutdown — DTEND is exclusive for all-day events. */
function dayAfter(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return compact(date.toISOString().slice(0, 10));
}

function summaryFor(model: Model, catalog: Model[]): string {
  const recommended = recommendedReplacement(model, catalog);
  const target = recommended
    ? ` → ${recommended.page ? recommended.page.model : recommended.ref.model}`
    : "";
  return `${providerLabel(model.provider)} shuts down ${model.name}${target}`;
}

function descriptionFor(model: Model, catalog: Model[], siteUrl: string): string {
  const recommended = recommendedReplacement(model, catalog);
  const lines = [
    `${modelFullLabel(model)} (${model.model}) is scheduled to shut down on the ${providerLabel(model.provider)} API.`,
  ];
  if (recommended) {
    lines.push(`Recommended replacement: ${recommended.ref.model}.`);
    if (recommended.ref.note) lines.push(recommended.ref.note);
  }
  lines.push(absolute(siteUrl, modelPagePath(model)));
  return lines.join("\n");
}

/**
 * The .ics feed. `stamp` is the DTSTAMP for every event — passed in rather than
 * read from the clock so a rebuild that changed no data produces a byte-identical
 * file, which keeps calendar clients from re-notifying on every deploy.
 */
export function buildIcs(models: Model[], siteUrl: string, stamp: string): string {
  const dated = models
    .filter((model) => shutdownDate(model))
    .sort((a, b) => (shutdownDate(a) ?? "").localeCompare(shutdownDate(b) ?? ""));

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:AI model shutdowns",
    "X-WR-CALDESC:Every announced AI model shutdown date, from modeldeprecations.dev",
    "REFRESH-INTERVAL;VALUE=DURATION:P1D",
    "X-PUBLISHED-TTL:P1D",
  ];

  for (const model of dated) {
    const date = shutdownDate(model)!;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${model.provider}-${model.model}-shutdown@modeldeprecations.dev`,
      `DTSTAMP:${compact(stamp)}T000000Z`,
      `DTSTART;VALUE=DATE:${compact(date)}`,
      `DTEND;VALUE=DATE:${dayAfter(date)}`,
      fold(`SUMMARY:${escapeText(summaryFor(model, models))}`),
      fold(`DESCRIPTION:${escapeText(descriptionFor(model, models, siteUrl))}`),
      fold(`URL:${absolute(siteUrl, modelPagePath(model))}`),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR", "");
  return lines.join("\r\n");
}
