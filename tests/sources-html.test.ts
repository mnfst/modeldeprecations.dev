import { describe, expect, it } from "vitest";
import { convertHtml, HtmlConversionError } from "../src/sources/html.js";
import type { SourceEntry } from "../src/sources/registry.js";

const source: SourceEntry = {
  provider: "bedrock",
  slug: "model-lifecycle",
  catalog_provider: "bedrock",
  format: "html",
  url: "https://example.com/model-lifecycle",
  html_selector: "article",
  max_download_bytes: 10_000,
  min_bytes: 1,
  max_bytes: 10_000,
  required_markers: ["Model"],
};

function rows(markdown: string): string[][] {
  return markdown
    .split("\n")
    .filter((line) => line.startsWith("|") && !/^\|(?:\s*-+\s*\|)+$/.test(line))
    .map((line) =>
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    );
}

describe("HTML source conversion", () => {
  it("expands rowspans and repairs a missing provider cell", () => {
    const markdown = convertHtml(
      source,
      `<article><table>
        <tr><th>Model provider</th><th>Model name</th><th>Model ID</th><th>Regions</th><th>Legacy date</th><th>EOL date</th><th>Public extended access start date</th></tr>
        <tr><td rowspan="2">Anthropic</td><td rowspan="2">Claude 3 Haiku</td><td rowspan="2">anthropic.claude-3-haiku-v1:0</td><td>us-east-1</td><td>March 10, 2026</td><td>September 10, 2026</td><td>June 10, 2026</td></tr>
        <tr><td>us-gov-east-1, us-gov-west-1</td><td>March 10, 2026</td><td>September 10, 2026</td><td>June 10, 2026</td></tr>
        <tr><td>Command R</td><td>cohere.command-r-v1:0</td><td>us-east-1</td><td>February 19, 2026</td><td>August 19, 2026</td><td>May 19, 2026</td></tr>
      </table></article>`,
    );

    expect(rows(markdown)).toContainEqual([
      "Anthropic",
      "Claude 3 Haiku",
      "anthropic.claude-3-haiku-v1:0",
      "us-gov-east-1, us-gov-west-1",
      "March 10, 2026",
      "September 10, 2026",
      "June 10, 2026",
    ]);
    expect(rows(markdown)).toContainEqual([
      "Cohere",
      "Command R",
      "cohere.command-r-v1:0",
      "us-east-1",
      "February 19, 2026",
      "August 19, 2026",
      "May 19, 2026",
    ]);
  });

  it("combines split tables and separates paired date cells", () => {
    const markdown = convertHtml(
      source,
      `<article>
        <div data-slot="table-container"><table><tr><th>Model</th><th>Version</th><th>API</th><th><div class="flex justify-between">Deprecation<svg></svg>Retirement</div></th><th>Alternative</th></tr></table></div>
        <div><span>Scroll for more</span><svg></svg></div>
        <div data-slot="table-container"><table>
          <tr><td>Leanstral</td><td>26.03</td><td>labs-leanstral</td><td><div class="flex justify-between"><span>5/22/2026</span><span>6/30/2026</span></div></td><td>Leanstral 1.5</td></tr>
          <tr><td>Mathstral 7B</td><td>0.1</td><td></td><td><div class="flex justify-between"><span></span><span></span></div></td><td>Mistral Small 4</td></tr>
        </table></div>
      </article>`,
    );

    expect(rows(markdown)[0]).toEqual([
      "Model",
      "Version",
      "API",
      "Deprecation",
      "Retirement",
      "Alternative",
    ]);
    expect(rows(markdown)).toContainEqual([
      "Leanstral",
      "26.03",
      "labs-leanstral",
      "5/22/2026",
      "6/30/2026",
      "Leanstral 1.5",
    ]);
    expect(rows(markdown)).toContainEqual(["Mathstral 7B", "0.1", "", "", "", "Mistral Small 4"]);
    expect(markdown).not.toContain("Scroll for more");
    expect(markdown.match(/^\|(?:\s*-+\s*\|)+$/gm)).toHaveLength(1);
  });

  it("duplicates merged deprecation data into each affected row", () => {
    const markdown = convertHtml(
      source,
      `<article><table>
        <tr><th>Category</th><th>Model name</th><th>Deprecation time</th><th>Replacement model</th></tr>
        <tr><td rowspan="2">Qwen-Max</td><td>qwen3.6-max-preview</td><td rowspan="3">October 10, 2026</td><td rowspan="2">qwen3.7-max</td></tr>
        <tr><td>qwen3-max</td></tr>
        <tr><td>Qwen-VL</td><td>qwen3-vl-flash</td><td>qwen3.6-flash</td></tr>
      </table></article>`,
    );

    expect(rows(markdown)).toContainEqual([
      "Qwen-Max",
      "qwen3-max",
      "October 10, 2026",
      "qwen3.7-max",
    ]);
    expect(rows(markdown)).toContainEqual([
      "Qwen-VL",
      "qwen3-vl-flash",
      "October 10, 2026",
      "qwen3.6-flash",
    ]);
  });

  it("expands rowspan=0 to the end of the table", () => {
    const markdown = convertHtml(
      source,
      `<article><table>
        <tr><th>Provider</th><th>Model</th></tr>
        <tr><td rowspan="0">Anthropic</td><td>Claude</td></tr>
        <tr><td>Haiku</td></tr>
        <tr><td>Opus</td></tr>
      </table></article>`,
    );

    expect(rows(markdown)).toContainEqual(["Anthropic", "Claude"]);
    expect(rows(markdown)).toContainEqual(["Anthropic", "Haiku"]);
    expect(rows(markdown)).toContainEqual(["Anthropic", "Opus"]);
  });

  it("keeps rowspan=0 inside its own row group", () => {
    const markdown = convertHtml(
      source,
      `<article><table>
        <thead><tr><th>Provider</th><th>Model</th></tr></thead>
        <tbody><tr><td rowspan="0">Anthropic</td><td>Claude</td></tr><tr><td>Haiku</td></tr></tbody>
        <tbody><tr><td>Cohere</td><td>Command R</td></tr></tbody>
      </table></article>`,
    );

    expect(rows(markdown)).toEqual([
      ["Provider", "Model"],
      ["Anthropic", "Claude"],
      ["Anthropic", "Haiku"],
      ["Cohere", "Command R"],
    ]);
  });

  it("clamps a rowspan that reaches past its row group", () => {
    const markdown = convertHtml(
      source,
      `<article><table>
        <tr><th>Provider</th><th>Model</th></tr>
        <tr><td rowspan="9">Anthropic</td><td>Claude</td></tr>
        <tr><td>Haiku</td></tr>
      </table></article>`,
    );

    expect(rows(markdown)).toEqual([
      ["Provider", "Model"],
      ["Anthropic", "Claude"],
      ["Anthropic", "Haiku"],
    ]);
  });

  it("reads an unparseable span as 1 instead of dropping the source", () => {
    const markdown = convertHtml(
      source,
      `<article><table>
        <tr><th>Provider</th><th>Model</th></tr>
        <tr><td rowspan="">Anthropic</td><td colspan="">Claude</td></tr>
        <tr><td>Cohere</td><td>Command R</td></tr>
      </table></article>`,
    );

    expect(rows(markdown)).toEqual([
      ["Provider", "Model"],
      ["Anthropic", "Claude"],
      ["Cohere", "Command R"],
    ]);
  });

  it("does not merge a header table that belongs to another table's cell", () => {
    const markdown = convertHtml(
      source,
      `<article>
        <table><tr><td><table><tr><th>Region</th><th>Zone</th></tr></table></td></tr></table>
        <table><tr><td>Claude 3 Haiku</td><td>March 10, 2026</td></tr></table>
      </article>`,
    );

    // The nested header stays inside the cell it belongs to instead of being
    // lifted onto the table that happens to follow it.
    expect(rows(markdown)).toContainEqual(["Claude 3 Haiku", "March 10, 2026"]);
    expect(markdown).not.toMatch(/\| Region \| Zone \|/);
  });

  it("merges split header halves that sit in separate scroll containers", () => {
    const markdown = convertHtml(
      source,
      `<article>
        <div><div data-slot="table-container"><table><tr><th>Model</th><th>Retirement</th></tr></table></div></div>
        <div><div data-slot="table-container"><table>
          <tr><td>Leanstral</td><td>6/30/2026</td></tr>
          <tr><td>Mathstral 7B</td><td>7/31/2026</td></tr>
        </table></div></div>
      </article>`,
    );

    expect(rows(markdown)).toEqual([
      ["Model", "Retirement"],
      ["Leanstral", "6/30/2026"],
      ["Mathstral 7B", "7/31/2026"],
    ]);
    expect(markdown.match(/^\|(?:\s*-+\s*\|)+$/gm)).toHaveLength(1);
  });
  it("leaves a rowspanned provider column to the span expander", () => {
    const markdown = convertHtml(
      source,
      `<article><table>
        <tr><th>Model provider</th><th>Model name</th><th>Model ID</th></tr>
        <tr><td rowspan="2">Amazon Web Services</td><td>Claude v2</td><td>anthropic.claude-v2</td></tr>
        <tr><td>Claude v3</td><td>anthropic.claude-v3</td></tr>
      </table></article>`,
    );

    expect(rows(markdown)).toEqual([
      ["Model provider", "Model name", "Model ID"],
      ["Amazon Web Services", "Claude v2", "anthropic.claude-v2"],
      ["Amazon Web Services", "Claude v3", "anthropic.claude-v3"],
    ]);
  });

  it("reports a conversion failure with the underlying cause", () => {
    expect(() => convertHtml({ ...source, html_selector: "[" }, "<article></article>")).toThrow(
      expect.objectContaining<Partial<HtmlConversionError>>({
        code: "conversion_failed",
        message: expect.stringMatching(/^HTML conversion failed: .+/),
      }),
    );
  });
});
