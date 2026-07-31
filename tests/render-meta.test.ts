import { describe, expect, it } from "vitest";
import { DESCRIPTION_MAX, fitText, TITLE_MAX, truncate } from "../src/build/meta.js";
import { homeDescription, homeTitle } from "../src/build/render.js";
import { modelPageDescription, modelPageTitle } from "../src/build/render-model.js";
import { providerPageDescription, providerPageTitle } from "../src/build/render-provider.js";
import {
  calendarPageDescription,
  calendarPageTitle,
  groupByMonth,
} from "../src/build/render-calendar.js";
import { changelogPageDescription, changelogPageTitle } from "../src/build/render-changelog.js";
import { apiPageDescription, apiPageTitle } from "../src/build/render-api.js";
import { aboutPageDescription, aboutPageTitle } from "../src/build/render-about.js";
import {
  statusHubDescription,
  statusHubTitle,
  yearHubDescription,
  yearHubTitle,
} from "../src/build/render-hub.js";
import { buildChangelog } from "../src/data/changelog.js";
import { uniqueProviders, upcomingShutdowns } from "../src/data/catalog.js";
import {
  deprecatedEntries,
  retiredEntries,
  scheduledEntries,
  shutdownsInYear,
  shutdownYears,
  STATUS_HUBS,
} from "../src/data/hubs.js";
import { loadAllModels } from "../src/data/load.js";
import {
  modelPagePath,
  providerPagePath,
  badgeJsonPath,
  modelMarkdownPath,
  shutdownYearPath,
  statusHubPath,
} from "../src/data/urls.js";
import { model, TODAY } from "./helpers.js";

describe("url helpers", () => {
  it("puts a model at the shortest honest path", () => {
    expect(modelPagePath(model())).toBe("/openai/gpt-4-32k");
    expect(modelMarkdownPath(model())).toBe("/openai/gpt-4-32k.md");
    expect(badgeJsonPath(model())).toBe("/badge/openai/gpt-4-32k.json");
    expect(providerPagePath("openai")).toBe("/openai");
  });
});

describe("fitText and truncate", () => {
  it("takes the richest candidate that fits", () => {
    expect(fitText(["aaaaaa", "aaa", "a"], 4)).toBe("aaa");
  });

  it("falls back to the shortest candidate when none fit", () => {
    expect(fitText(["aaaaaa", "aaaa"], 2)).toBe("aaaa");
  });

  it("truncates on a word boundary", () => {
    expect(truncate("the quick brown fox jumps", 16)).toBe("the quick brown…");
  });
});

describe("model page meta", () => {
  it("leads the title with the model name and the deprecation keyword", () => {
    expect(modelPageTitle(model(), TODAY).startsWith("GPT-4 32k deprecation")).toBe(true);
  });

  it("phrases an active model's title as the question people type", () => {
    const active = model({ status: "active", deprecated_on: undefined, shutdown_on: undefined });
    expect(modelPageTitle(active, TODAY)).toContain("deprecated?");
  });

  // The snippet and the page should be the same sentence, or the page under-
  // delivers on what the search result promised.
  it("uses the answer itself as the description", () => {
    const description = modelPageDescription(model(), [model()], TODAY);
    expect(description.startsWith("Yes — ")).toBe(true);
  });

  it("never cuts a description off mid-clause", () => {
    const long = model({ name: "A Model With A Very Long Marketing Name Indeed Yes" });
    const description = modelPageDescription(long, [long], TODAY);
    expect(description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(description.endsWith(".")).toBe(true);
  });

  // "Claude Sonnet 3.5" is not a string anyone types when they mean
  // claude-3-5-sonnet-20240620, and the id is what their code says.
  it("carries the API id when the display name does not spell it", () => {
    const dated = model({ model: "claude-3-5-sonnet-20240620", name: "Claude Sonnet 3.5" });
    expect(modelPageTitle(dated, TODAY)).toContain("claude-3-5-sonnet-20240620");
  });

  it("does not repeat the id when the name already spells it", () => {
    // "GPT-4 32k" and gpt-4-32k differ only in punctuation and case.
    expect(modelPageTitle(model(), TODAY)).not.toContain("(gpt-4-32k)");
  });

  // The id has to survive even when the name leaves no room to carry both.
  it("drops the display name before the id when only one fits", () => {
    const verbose = model({
      model: "gpt-4o-mini-search-preview-2025-03-11",
      name: "GPT-4o mini Search Preview",
    });
    const title = modelPageTitle(verbose, TODAY);
    expect(title).toContain("gpt-4o-mini-search-preview-2025-03-11");
    expect(title).not.toContain("GPT-4o mini Search Preview");
    expect(title.length).toBeLessThanOrEqual(TITLE_MAX);
  });
});

describe("aggregate page meta", () => {
  it("leads the homepage title with the category, not the brand", () => {
    expect(homeTitle(114).startsWith("AI Model Deprecations")).toBe(true);
    expect(homeTitle(114)).toContain("114");
  });

  it("opens the homepage description with the question a searcher asked", () => {
    expect(homeDescription(114, 12, 3).startsWith("Is your model deprecated?")).toBe(true);
  });

  it("targets the provider list query", () => {
    expect(providerPageTitle("openai").startsWith("OpenAI deprecated models")).toBe(true);
  });

  it("keeps every aggregate title inside the SERP budget at any scale", () => {
    for (const title of [
      homeTitle(100000),
      providerPageTitle("openai"),
      calendarPageTitle(),
      changelogPageTitle(),
      apiPageTitle(),
    ]) {
      expect(title.length).toBeLessThanOrEqual(TITLE_MAX);
    }
    expect(homeDescription(100000, 900, 40).length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(apiPageDescription(100000).length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });
});

describe("groupByMonth", () => {
  it("buckets shutdowns by calendar month, in order", () => {
    const rows = [
      { model: model(), life: { shutdown: "2026-10-23" } },
      { model: model(), life: { shutdown: "2026-08-10" } },
      { model: model(), life: { shutdown: "2026-10-01" } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any;
    const months = groupByMonth(rows);
    expect(months.map((month) => month.month)).toEqual(["2026-08", "2026-10"]);
    expect(months[1]!.entries).toHaveLength(2);
    expect(months[0]!.label).toBe("August 2026");
  });
});

// The templates above are budget-aware, but only the real catalog has the model
// names long enough to blow the budget. This walks every page the build emits so
// an overflowing or duplicated title can't ship unnoticed.
describe("every page in the real catalog", async () => {
  const { models } = await loadAllModels();
  const providers = uniqueProviders(models);
  const changelog = buildChangelog(models);

  const pages: { page: string; title: string; description: string }[] = [
    {
      page: "/",
      title: homeTitle(models.length),
      description: homeDescription(
        models.length,
        upcomingShutdowns(models, TODAY).length,
        providers.length,
      ),
    },
    {
      page: "/calendar",
      title: calendarPageTitle(),
      description: calendarPageDescription(upcomingShutdowns(models, TODAY), TODAY),
    },
    {
      page: "/changelog",
      title: changelogPageTitle(),
      description: changelogPageDescription(changelog),
    },
    { page: "/api", title: apiPageTitle(), description: apiPageDescription(models.length) },
    { page: "/about", title: aboutPageTitle(), description: aboutPageDescription(models.length) },
    ...STATUS_HUBS.map((status) => ({
      page: statusHubPath(status),
      title: statusHubTitle(status),
      description: statusHubDescription(
        status,
        status === "deprecated"
          ? deprecatedEntries(models, TODAY).length + scheduledEntries(models, TODAY).length
          : retiredEntries(models, TODAY).length,
        TODAY,
      ),
    })),
    ...shutdownYears(models, TODAY).map((year) => ({
      page: shutdownYearPath(year),
      title: yearHubTitle(year),
      description: yearHubDescription(year, shutdownsInYear(models, TODAY, year)),
    })),
    ...providers.map((provider) => ({
      page: providerPagePath(provider),
      title: providerPageTitle(provider),
      description: providerPageDescription(
        provider,
        models.filter((m) => m.provider === provider),
        TODAY,
      ),
    })),
    ...models.map((entry) => ({
      page: modelPagePath(entry),
      title: modelPageTitle(entry, TODAY),
      description: modelPageDescription(entry, models, TODAY),
    })),
  ];

  it("has a catalog worth checking", () => {
    expect(pages.length).toBeGreaterThan(100);
  });

  it("keeps every title within the truncation limit", () => {
    const over = pages.filter((page) => page.title.length > TITLE_MAX);
    expect(over.map((page) => `${page.page} (${page.title.length}): ${page.title}`)).toEqual([]);
  });

  it("keeps every description within the truncation limit", () => {
    const over = pages.filter((page) => page.description.length > DESCRIPTION_MAX);
    expect(over.map((page) => `${page.page} (${page.description.length})`)).toEqual([]);
  });

  it("keeps every title and description unique", () => {
    expect(new Set(pages.map((page) => page.title)).size).toBe(pages.length);
    expect(new Set(pages.map((page) => page.description)).size).toBe(pages.length);
  });

  it("opens every model description with a literal verdict", () => {
    // Matched against the real model paths, not the segment count — /shutdowns/2027
    // is two segments deep too, and it answers a different question.
    const modelPaths = new Set(models.map((entry) => modelPagePath(entry)));
    const hedged = pages
      .filter((page) => modelPaths.has(page.page))
      .filter((page) => !/^(Yes|No) — /.test(page.description));
    expect(hedged.map((page) => page.page)).toEqual([]);
  });
});
