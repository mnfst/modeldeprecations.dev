// The calendar and the changelog feed are the two assets nothing else in this
// space offers, so their formats have to be right — a malformed .ics is silently
// rejected by every calendar client, with no error a reader would ever see.

import { describe, expect, it } from "vitest";
import { buildIcs, fold } from "../src/data/calendar.js";
import { buildChangelog } from "../src/data/changelog.js";
import { buildRss, rfc822 } from "../src/data/feed.js";
import { buildBadge } from "../src/data/badge.js";
import { loadAllModels } from "../src/data/load.js";
import { model, SITE, TODAY } from "./helpers.js";

describe("buildIcs", () => {
  const ics = buildIcs([model()], SITE, TODAY);

  it("wraps events in a well-formed VCALENDAR", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe((ics.match(/END:VEVENT/g) ?? []).length);
  });

  it("uses CRLF line endings, as RFC 5545 requires", () => {
    expect(ics.split("\r\n").length).toBeGreaterThan(10);
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  // DTEND is exclusive for all-day events: a one-day event on the 6th ends on
  // the 7th, or calendars render it as zero-length and hide it.
  it("makes each shutdown a single all-day event", () => {
    expect(ics).toContain("DTSTART;VALUE=DATE:20250606");
    expect(ics).toContain("DTEND;VALUE=DATE:20250607");
  });

  it("handles a month-end shutdown without rolling into the wrong month", () => {
    const eom = buildIcs([model({ shutdown_on: "2026-02-28", status: "retired" })], SITE, TODAY);
    expect(eom).toContain("DTEND;VALUE=DATE:20260301");
  });

  it("gives each event a stable UID so re-subscribing does not duplicate it", () => {
    expect(ics).toContain("UID:openai-gpt-4-32k-shutdown@modeldeprecations.dev");
  });

  // A rebuild that changed no data must produce an identical file, or every
  // deploy re-notifies everyone who subscribed.
  it("is byte-identical across rebuilds of unchanged data", () => {
    expect(buildIcs([model()], SITE, TODAY)).toBe(ics);
  });

  it("escapes commas, semicolons and newlines in text values", () => {
    const tricky = buildIcs([model({ name: "A, B; C", replacements: [] })], SITE, TODAY);
    expect(tricky).toContain("A\\, B\\; C");
  });

  it("omits models with no shutdown date", () => {
    const undated = model({ shutdown_on: undefined, deprecated_on: undefined, status: "active" });
    expect(buildIcs([undated], SITE, TODAY)).not.toContain("BEGIN:VEVENT");
  });

  it("orders events by date", async () => {
    const { models } = await loadAllModels();
    const dates = [...buildIcs(models, SITE, TODAY).matchAll(/DTSTART;VALUE=DATE:(\d{8})/g)].map(
      (match) => match[1]!,
    );
    expect([...dates].sort()).toEqual(dates);
  });
});

describe("fold", () => {
  it("leaves a short line alone", () => {
    expect(fold("SUMMARY:short")).toBe("SUMMARY:short");
  });

  it("folds long lines with a leading space on continuations", () => {
    const folded = fold(`SUMMARY:${"a".repeat(200)}`);
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.slice(1).every((line) => line.startsWith(" "))).toBe(true);
  });

  // The RFC limit is octets, not characters. Em dashes and arrows are three
  // bytes each, so a character-counted fold silently emits over-length lines.
  it("measures the limit in octets, not characters", () => {
    const folded = fold(`DESCRIPTION:${"—".repeat(100)}`);
    for (const line of folded.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("never splits a multi-byte character across two lines", () => {
    const folded = fold(`DESCRIPTION:${"→".repeat(120)}`);
    expect(folded).not.toContain("�");
    expect(folded.replace(/\r\n /g, "")).toBe(`DESCRIPTION:${"→".repeat(120)}`);
  });
});

describe("buildRss", () => {
  const rss = buildRss(buildChangelog([model()]), SITE);

  it("emits a valid RSS 2.0 channel with a self link", () => {
    expect(rss.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(rss).toContain('<rss version="2.0"');
    expect(rss).toContain(`<atom:link href="${SITE}/changelog.xml" rel="self"`);
  });

  it("gives each item a permanent guid and an RFC 822 pubDate", () => {
    expect(rss).toContain('<guid isPermaLink="false">');
    expect(rss).toContain("<pubDate>Fri, 06 Jun 2025 00:00:00 GMT</pubDate>");
  });

  it("escapes XML-significant characters in titles", () => {
    const escaped = buildRss(buildChangelog([model({ name: "A & B <C>" })]), SITE);
    expect(escaped).toContain("A &amp; B &lt;C&gt;");
    expect(escaped).not.toContain("<C>");
  });

  it("formats RFC 822 dates in GMT", () => {
    expect(rfc822("2026-10-23")).toBe("Fri, 23 Oct 2026 00:00:00 GMT");
  });
});

describe("buildBadge", () => {
  it("emits shields.io endpoint JSON keyed on the model id", () => {
    expect(buildBadge(model(), TODAY)).toEqual({
      schemaVersion: 1,
      label: "gpt-4-32k",
      message: "retired",
      color: "red",
    });
  });

  it("uses the traffic light readers already expect", () => {
    const deprecated = model({ shutdown_on: "2026-10-23", status: "deprecated" });
    expect(buildBadge(deprecated, TODAY).color).toBe("orange");
    const active = model({ shutdown_on: undefined, deprecated_on: undefined, status: "active" });
    expect(buildBadge(active, TODAY).color).toBe("brightgreen");
  });

  it("warns on an active model that already has a shutdown date", () => {
    const scheduled = model({
      shutdown_on: undefined,
      deprecated_on: undefined,
      earliest_shutdown_on: "2026-10-16",
      status: "active",
    });
    const badge = buildBadge(scheduled, TODAY);
    expect(badge.message).toBe("active until 2026-10-16");
    expect(badge.color).toBe("yellowgreen");
  });

  // A badge in a README is only worth embedding if it changes on its own.
  it("turns red by itself once the shutdown date passes", () => {
    const m = model({ shutdown_on: "2026-10-23", status: "deprecated" });
    expect(buildBadge(m, "2026-10-22").color).toBe("orange");
    expect(buildBadge(m, "2026-10-23").color).toBe("red");
  });
});
