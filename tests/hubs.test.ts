// The cross-provider slices, and the indexation rules the rendered HTML has to
// carry. Both live here because they answer the same question: which pages are
// we asking a search engine to keep, and which are we telling it to skip.

import { describe, expect, it } from "vitest";
import { renderApiPage } from "../src/build/render-api.js";
import { renderStatusHubPage, renderYearHubPage } from "../src/build/render-hub.js";
import { renderModelPage } from "../src/build/render-model.js";
import { renderIndex } from "../src/build/render.js";
import {
  deprecatedEntries,
  retiredEntries,
  scheduledEntries,
  shutdownsInYear,
  shutdownYears,
} from "../src/data/hubs.js";
import { model, TODAY } from "./helpers.js";

const retired = model({ model: "gpt-4-32k", status: "retired", shutdown_on: "2025-06-06" });
const deprecated = model({
  model: "gpt-3.5-turbo",
  name: "GPT-3.5 Turbo",
  status: "deprecated",
  deprecated_on: "2026-01-01",
  shutdown_on: "2026-10-23",
});
const scheduled = model({
  model: "gemini-2.5-pro",
  name: "Gemini 2.5 Pro",
  status: "active",
  deprecated_on: undefined,
  shutdown_on: undefined,
  earliest_shutdown_on: "2027-10-16",
});
const plain = model({
  model: "gpt-5",
  name: "GPT-5",
  status: "active",
  deprecated_on: undefined,
  shutdown_on: undefined,
});
const catalog = [retired, deprecated, scheduled, plain];

describe("lifecycle hubs", () => {
  it("puts each model in exactly the cohort its status names", () => {
    expect(deprecatedEntries(catalog, TODAY).map((e) => e.model.model)).toEqual(["gpt-3.5-turbo"]);
    expect(retiredEntries(catalog, TODAY).map((e) => e.model.model)).toEqual(["gpt-4-32k"]);
    // Dated but not deprecated. Keeping these out of the deprecated cohort is the
    // whole point: the provider scheduled a retirement, it did not deprecate.
    expect(scheduledEntries(catalog, TODAY).map((e) => e.model.model)).toEqual(["gemini-2.5-pro"]);
  });

  it("leaves a model with no date out of every cohort", () => {
    const all = [
      ...deprecatedEntries(catalog, TODAY),
      ...retiredEntries(catalog, TODAY),
      ...scheduledEntries(catalog, TODAY),
    ].map((entry) => entry.model.model);
    expect(all).not.toContain("gpt-5");
  });

  it("orders deprecated models by urgency and retired models by recency", () => {
    const later = model({
      model: "gpt-4",
      name: "GPT-4",
      status: "deprecated",
      shutdown_on: "2027-01-01",
    });
    const order = deprecatedEntries([later, deprecated], TODAY).map((e) => e.model.model);
    expect(order).toEqual(["gpt-3.5-turbo", "gpt-4"]);

    const older = model({ model: "davinci", status: "retired", shutdown_on: "2024-01-04" });
    expect(retiredEntries([older, retired], TODAY).map((e) => e.model.model)).toEqual([
      "gpt-4-32k",
      "davinci",
    ]);
  });
});

describe("year hubs", () => {
  it("derives years from the dates present, so no hub is ever empty", () => {
    const years = shutdownYears(catalog, TODAY);
    expect(years).toEqual(["2025", "2026", "2027"]);
    for (const year of years) {
      expect(shutdownsInYear(catalog, TODAY, year).length).toBeGreaterThan(0);
    }
  });

  it("buckets a model by the date it actually stops answering", () => {
    expect(shutdownsInYear(catalog, TODAY, "2026").map((e) => e.model.model)).toEqual([
      "gpt-3.5-turbo",
    ]);
    // The soft date counts: it is still the day the model could stop answering.
    expect(shutdownsInYear(catalog, TODAY, "2027").map((e) => e.model.model)).toEqual([
      "gemini-2.5-pro",
    ]);
    expect(shutdownsInYear(catalog, TODAY, "2030")).toEqual([]);
  });
});

describe("indexation", () => {
  it("marks the API docs noindex so nothing under /api competes in search", async () => {
    const html = await renderApiPage(catalog, TODAY);
    expect(html).toContain('<meta name="robots" content="noindex, follow" />');
  });

  it("leaves every page we do want indexed without a robots tag", async () => {
    for (const html of [
      await renderIndex({ models: catalog, today: TODAY }),
      await renderModelPage(retired, catalog, TODAY),
      await renderStatusHubPage("deprecated", catalog, TODAY),
      await renderYearHubPage("2026", catalog, TODAY),
    ]) {
      expect(html).not.toContain('name="robots"');
      expect(html).toContain('rel="canonical"');
    }
  });
});

describe("analytics", () => {
  // It used to be passed by hand and only the homepage ever got it, which left
  // every model page — the entire long tail — unmeasured.
  it("tags every page type on Vercel, not just the homepage", async () => {
    const before = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      for (const html of [
        await renderIndex({ models: catalog, today: TODAY }),
        await renderModelPage(retired, catalog, TODAY),
        await renderStatusHubPage("retired", catalog, TODAY),
        await renderYearHubPage("2026", catalog, TODAY),
        await renderApiPage(catalog, TODAY),
      ]) {
        expect(html).toContain("_vercel/insights/script.js");
      }
    } finally {
      if (before === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = before;
    }
  });

  it("stays off elsewhere, so a local build emits no script tag that 404s", async () => {
    expect(process.env.VERCEL).not.toBe("1");
    expect(await renderModelPage(retired, catalog, TODAY)).not.toContain("_vercel/insights");
  });
});
