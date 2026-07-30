// The AEO surface: llms.txt, the Markdown twin of every page, robots.txt and the
// in-browser WebMCP tools. These exist so an assistant can answer "is X
// deprecated" from one fetch, with the citation attached.

import { describe, expect, it } from "vitest";
import { buildLlmsFullTxt, buildLlmsTxt, usageGuideMarkdown } from "../src/data/llms.js";
import { modelMarkdown } from "../src/data/markdown.js";
import { buildRobotsTxt } from "../src/data/robots.js";
import { loadAllModels } from "../src/data/load.js";
import { deprecationReport, listShutdowns, lookupModel } from "../src/client/webmcp.js";
import { model, SITE, TODAY } from "./helpers.js";

const successor = model({
  model: "gpt-4o",
  name: "GPT-4o",
  status: "active",
  deprecated_on: undefined,
  shutdown_on: undefined,
});
const catalog = [model({ aliases: ["gpt-4-32k-0613"] }), successor];

describe("buildRobotsTxt", () => {
  const robots = buildRobotsTxt(SITE);

  it("allows everything and points at the sitemap", () => {
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });

  // Disallowing the JSON would hide its noindex header from crawlers, stranding
  // the URLs in the index instead of dropping them.
  it("never disallows the JSON API or the badges", () => {
    expect(robots).not.toMatch(/^Disallow: \/api/m);
    expect(robots).not.toMatch(/^Disallow: \/badge/m);
  });

  it("advertises llms.txt to agents in the first line", () => {
    expect(robots.split("\n")[0]).toContain(`${SITE}/llms.txt`);
  });
});

describe("buildLlmsTxt", () => {
  const llms = buildLlmsTxt(SITE, catalog, TODAY);

  it("follows the llms.txt convention: H1, blockquote, link sections", () => {
    const lines = llms.split("\n");
    expect(lines[0]).toBe("# modeldeprecations.dev");
    expect(lines[2]!.startsWith("> ")).toBe(true);
    for (const heading of ["## Next shutdowns", "## API", "## Feeds", "## Models"]) {
      expect(llms).toContain(heading);
    }
  });

  it("gives an agent the verdict for each model without a second fetch", () => {
    expect(llms).toContain("OpenAI GPT-4 32k was retired on June 6, 2025.");
    expect(llms).toContain("OpenAI GPT-4o is not deprecated.");
  });

  it("links each model to its Markdown twin rather than to HTML", () => {
    expect(llms).toContain(`${SITE}/openai/gpt-4-32k.md`);
  });

  it("points at the calendar and RSS feeds", () => {
    expect(llms).toContain(`${SITE}/calendar.ics`);
    expect(llms).toContain(`${SITE}/changelog.xml`);
  });

  it("explains the three lifecycle states in the usage guide", () => {
    const guide = usageGuideMarkdown(SITE);
    for (const state of ["**active**", "**deprecated**", "**retired**"]) {
      expect(guide).toContain(state);
    }
    expect(guide).toContain("not deprecations");
  });

  it("names the WebMCP tools it actually registers", () => {
    const guide = usageGuideMarkdown(SITE);
    for (const tool of ["check_model_deprecation", "list_shutdowns", "find_replacement"]) {
      expect(guide).toContain(tool);
    }
  });
});

describe("buildLlmsFullTxt", () => {
  const full = buildLlmsFullTxt(SITE, catalog, TODAY);

  it("inlines every model with its dates and sources", () => {
    expect(full).toContain("### openai/gpt-4-32k");
    expect(full).toContain("- Deprecated: 2024-06-06");
    expect(full).toContain("- Shutdown: 2025-06-06");
    expect(full).toContain("- Source: https://example.com/deprecations (2026-07-30)");
  });

  it("marks a soft shutdown date as an estimate", () => {
    const soft = model({
      shutdown_on: undefined,
      deprecated_on: undefined,
      earliest_shutdown_on: "2027-05-28",
      status: "active",
    });
    expect(buildLlmsFullTxt(SITE, [soft], TODAY)).toContain("- Shutdown (earliest): 2027-05-28");
  });

  it("groups by provider and starts with the usage guide", () => {
    expect(full.startsWith("# How to use modeldeprecations.dev")).toBe(true);
    expect(full).toContain("## OpenAI");
  });
});

describe("modelMarkdown", () => {
  const md = modelMarkdown(
    model({
      replacements: [{ provider: "openai", model: "gpt-4o", recommended: true, external: false }],
    }),
    catalog,
    SITE,
    TODAY,
  );

  it("leads with the answer as a blockquote", () => {
    expect(md.split("\n")[0]).toBe("# OpenAI GPT-4 32k — deprecation status");
    expect(md).toContain("> Yes — GPT-4 32k is retired.");
  });

  it("renders the facts as a table an agent can parse", () => {
    expect(md).toContain("| Field | Value |");
    expect(md).toContain("| Status | Retired |");
    expect(md).toContain("| Shutdown | June 6, 2025 (419 days ago) |");
  });

  it("shows the id swap as a diff", () => {
    expect(md).toContain('- "model": "gpt-4-32k"');
    expect(md).toContain('+ "model": "gpt-4o"');
  });

  it("cites its sources with accessed dates", () => {
    expect(md).toContain("## Sources");
    expect(md).toContain("accessed 2026-07-30");
  });

  it("cross-links the sibling site for the successor's parameters", () => {
    expect(md).toContain("https://modelparams.dev/models/openai/gpt-4o");
  });

  it("holds up against the whole real catalog", async () => {
    const { models } = await loadAllModels();
    for (const entry of models) {
      const rendered = modelMarkdown(entry, models, SITE, TODAY);
      expect(rendered).toContain("# ");
      expect(rendered).toMatch(/> (Yes|No) — /);
    }
  });
});

describe("WebMCP tools", () => {
  const asCatalog = { count: catalog.length, asOf: TODAY, models: catalog };

  // Agents pass whatever the developer's code says. Any of these spellings
  // should get an answer rather than a "not found".
  it("resolves a bare id, a prefixed id, an alias and the wrong case", () => {
    for (const query of ["gpt-4-32k", "openai/gpt-4-32k", "gpt-4-32k-0613", "GPT-4-32K"]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(lookupModel(asCatalog as any, query)?.model).toBe("gpt-4-32k");
    }
  });

  it("returns not-found rather than guessing", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const report = deprecationReport(asCatalog as any, "gpt-9");
    expect(report.found).toBe(false);
  });

  it("answers the deprecation question with the evidence attached", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const report = deprecationReport(asCatalog as any, "gpt-4-32k") as Record<string, unknown>;
    expect(report.deprecated).toBe(true);
    expect(report.status).toBe("retired");
    expect(report.shutdown_on).toBe("2025-06-06");
    expect((report.sources as unknown[]).length).toBe(1);
  });

  it("says a live model is not deprecated", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const report = deprecationReport(asCatalog as any, "gpt-4o") as Record<string, unknown>;
    expect(report.deprecated).toBe(false);
    expect(report.status).toBe("active");
  });

  it("lists only shutdowns that are still ahead, soonest first", () => {
    const upcoming = {
      count: 2,
      asOf: TODAY,
      models: [
        model({ shutdown_on: "2026-12-11", status: "deprecated" }),
        model({ model: "b", shutdown_on: "2026-08-10", status: "deprecated" }),
        model({ model: "c", shutdown_on: "2025-06-06", status: "retired" }),
      ],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = listShutdowns(upcoming as any);
    expect(result.shutdowns.map((row) => row.shutdown)).toEqual(["2026-08-10", "2026-12-11"]);
  });

  it("scopes the list to a window when asked", () => {
    const upcoming = {
      count: 2,
      asOf: TODAY,
      models: [
        model({ shutdown_on: "2026-12-11", status: "deprecated" }),
        model({ model: "b", shutdown_on: "2026-08-10", status: "deprecated" }),
      ],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(listShutdowns(upcoming as any, 30).shutdowns).toHaveLength(1);
  });
});
