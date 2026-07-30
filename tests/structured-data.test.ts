import { describe, expect, it } from "vitest";
import {
  buildCalendarStructuredData,
  buildChangelogStructuredData,
  buildHomeStructuredData,
  buildModelStructuredData,
  buildProviderStructuredData,
} from "../src/build/structured-data.js";
import { buildChangelog } from "../src/data/changelog.js";
import { modelFaq } from "../src/data/faq.js";
import { lifecycle } from "../src/data/status.js";
import { model, SITE, TODAY } from "./helpers.js";

function nodes(json: string): Record<string, unknown>[] {
  const parsed = JSON.parse(json) as { "@context": string; "@graph": Record<string, unknown>[] };
  expect(parsed["@context"]).toBe("https://schema.org");
  return parsed["@graph"];
}

function typesIn(json: string): string[] {
  return nodes(json).map((node) => node["@type"] as string);
}

describe("buildHomeStructuredData", () => {
  const json = buildHomeStructuredData([model()], SITE, `${SITE}/assets/og.png`, TODAY);

  it("emits Organization, WebSite, Dataset and ItemList", () => {
    expect(typesIn(json)).toEqual(["Organization", "WebSite", "Dataset", "ItemList"]);
  });

  it("parses as valid JSON-LD", () => {
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("lists every model with no arbitrary cap", () => {
    const many = Array.from({ length: 120 }, (_, i) => model({ model: `m-${i}` }));
    const parsed = nodes(buildHomeStructuredData(many, SITE, `${SITE}/x.png`, TODAY));
    const list = parsed.find((node) => node["@type"] === "ItemList") as { numberOfItems: number };
    expect(list.numberOfItems).toBe(120);
  });

  it("links the sibling site so the two are read as one publisher", () => {
    expect(json).toContain("https://modelparams.dev");
    expect(json).toContain("https://github.com/mnfst/modeldeprecations.dev");
  });

  // Google ignores SVG when it extracts a publisher logo, so the node has to
  // point at the raster icon rather than the favicon the browser uses.
  it("gives the Organization a raster logo", () => {
    const org = nodes(json).find((node) => node["@type"] === "Organization");
    expect(org?.logo).toBe(`${SITE}/assets/apple-touch-icon.png`);
  });
});

describe("buildModelStructuredData", () => {
  const faqs = modelFaq(model(), [model()], TODAY);
  const json = buildModelStructuredData(model(), "desc", SITE, faqs, TODAY);

  it("emits a breadcrumb, a dataset and an FAQPage", () => {
    expect(typesIn(json)).toEqual(["BreadcrumbList", "Dataset", "FAQPage"]);
  });

  it("breadcrumbs home → provider → model", () => {
    const crumbs = nodes(json)[0] as { itemListElement: { name: string; item: string }[] };
    expect(crumbs.itemListElement.map((crumb) => crumb.item)).toEqual([
      `${SITE}/`,
      `${SITE}/openai`,
      `${SITE}/openai/gpt-4-32k`,
    ]);
  });

  // The citation array is the machine-readable half of the trust claim the page
  // makes in prose. If it were empty, the JSON-LD would say less than the HTML.
  it("carries the sources as schema.org citations", () => {
    const dataset = nodes(json)[1] as { citation: { url: string }[] };
    expect(dataset.citation).toHaveLength(1);
    expect(dataset.citation[0]!.url).toBe("https://example.com/deprecations");
  });

  it("publishes the lifecycle as measured variables", () => {
    const dataset = nodes(json)[1] as { variableMeasured: { name: string; value: string }[] };
    const byName = Object.fromEntries(dataset.variableMeasured.map((v) => [v.name, v.value]));
    expect(byName.status).toBe("retired");
    expect(byName.shutdown_on).toBe("2025-06-06");
  });

  it("labels a soft date as earliest_shutdown_on, not shutdown_on", () => {
    const soft = model({
      shutdown_on: undefined,
      deprecated_on: undefined,
      earliest_shutdown_on: "2027-05-28",
      status: "active",
    });
    const dataset = nodes(buildModelStructuredData(soft, "d", SITE, [], TODAY))[1] as {
      variableMeasured: { name: string }[];
    };
    expect(dataset.variableMeasured.map((v) => v.name)).toContain("earliest_shutdown_on");
    expect(dataset.variableMeasured.map((v) => v.name)).not.toContain("shutdown_on");
  });

  it("omits the FAQPage node when there are no questions", () => {
    expect(typesIn(buildModelStructuredData(model(), "desc", SITE, [], TODAY))).toEqual([
      "BreadcrumbList",
      "Dataset",
    ]);
  });

  it("shapes every FAQ entry as Question/acceptedAnswer", () => {
    const page = nodes(json)[2] as {
      mainEntity: {
        "@type": string;
        name: string;
        acceptedAnswer: { "@type": string; text: string };
      }[];
    };
    expect(page.mainEntity.length).toBeGreaterThan(0);
    for (const entry of page.mainEntity) {
      expect(entry["@type"]).toBe("Question");
      expect(entry.acceptedAnswer["@type"]).toBe("Answer");
      expect(entry.acceptedAnswer.text.length).toBeGreaterThan(0);
    }
  });
});

describe("hub structured data", () => {
  it("lists provider models with their live status", () => {
    const json = buildProviderStructuredData("openai", [model()], "desc", SITE, TODAY);
    expect(typesIn(json)).toEqual(["BreadcrumbList", "ItemList"]);
    expect(json).toContain("GPT-4 32k — retired");
  });

  it("lists the calendar as an ordered ItemList", () => {
    const entry = { model: model(), life: lifecycle(model(), TODAY) };
    const json = buildCalendarStructuredData([entry], "desc", SITE);
    expect(typesIn(json)).toEqual(["BreadcrumbList", "ItemList"]);
    expect(json).toContain("shuts down 2025-06-06");
  });

  it("lists changelog entries with their dates", () => {
    const json = buildChangelogStructuredData(buildChangelog([model()]), "desc", SITE);
    expect(typesIn(json)).toEqual(["BreadcrumbList", "ItemList"]);
    expect(json).toContain("2025-06-06:");
  });
});
