import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadSourceRegistry,
  snapshotPath,
  validateSnapshotInventory,
} from "../src/sources/registry.js";

const temporary: string[] = [];
const validSource = {
  provider: "openai",
  slug: "deprecations",
  catalog_provider: "openai",
  format: "markdown",
  url: "https://example.com/deprecations.md",
  min_bytes: 100,
  max_bytes: 1000,
  required_markers: ["Deprecations"],
};

const validHtmlSource = {
  ...validSource,
  provider: "google",
  catalog_provider: undefined,
  format: "html",
  url: "https://example.com/deprecations",
  html_selector: "article",
  max_download_bytes: 2000,
};

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function fixture(sources: Record<string, unknown>[] = [validSource]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "source-registry-"));
  temporary.push(root);
  const models = path.join(root, "models");
  const snapshots = path.join(root, "snapshots");
  await fs.mkdir(path.join(models, "openai"), { recursive: true });
  const file = path.join(root, "sources.yaml");
  await fs.writeFile(file, yaml.dump({ sources }), "utf8");
  return { file, models, snapshots };
}

describe("source registry", () => {
  it("loads a valid registry and resolves a safe snapshot path", async () => {
    const { file, models, snapshots } = await fixture();
    const result = await loadSourceRegistry(file, models);
    expect(result.issues).toEqual([]);
    expect(snapshotPath(result.registry!.sources[0]!, snapshots)).toBe(
      path.join(snapshots, "openai", "deprecations.md"),
    );
  });

  it("loads an HTML source with bounded conversion fields", async () => {
    const { file, models } = await fixture([validHtmlSource]);
    const result = await loadSourceRegistry(file, models);
    expect(result.issues).toEqual([]);
    expect(result.registry!.sources[0]).toMatchObject({
      format: "html",
      html_selector: "article",
      max_download_bytes: 2000,
    });
  });

  it("defaults existing registry rows to markdown", async () => {
    const { file, models } = await fixture([{ ...validSource, format: undefined }]);
    const result = await loadSourceRegistry(file, models);
    expect(result.issues).toEqual([]);
    expect(result.registry!.sources[0]!.format).toBe("markdown");
  });

  it.each([
    ["unknown provider", { provider: "not-modelparams" }],
    ["legacy provider slug", { provider: "zai" }],
    ["unsafe slug", { slug: "../escape" }],
    ["malformed URL", { url: "not a URL" }],
    ["HTTP URL", { url: "http://example.com/deprecations.md" }],
    ["URL credentials", { url: "https://user@example.com/deprecations.md" }],
    ["URL fragment", { url: "https://example.com/deprecations.md#part" }],
    ["non-markdown URL", { url: "https://example.com/deprecations" }],
    ["HTML source without selector", { ...validHtmlSource, html_selector: undefined }],
    ["HTML source without download bound", { ...validHtmlSource, max_download_bytes: undefined }],
    ["invalid HTML selector", { ...validHtmlSource, html_selector: "[" }],
    ["unbounded HTML download", { ...validHtmlSource, max_download_bytes: 5_000_001 }],
    ["markdown source with HTML fields", { html_selector: "article" }],
    ["empty markers", { required_markers: [] }],
    ["inverted bounds", { max_bytes: 50 }],
    ["unknown field", { extra: true }],
  ])("rejects %s", async (_name, change) => {
    const { file, models } = await fixture([{ ...validSource, ...change }]);
    expect((await loadSourceRegistry(file, models)).issues).not.toEqual([]);
  });

  it("rejects duplicate ids and URLs", async () => {
    const { file, models } = await fixture([validSource, validSource]);
    const messages = (await loadSourceRegistry(file, models)).issues.map((issue) => issue.message);
    expect(messages).toEqual([
      expect.stringContaining("duplicate source id"),
      expect.stringContaining("duplicate source URL"),
    ]);
  });

  it("reports independent HTML diagnostics when the URL is malformed", async () => {
    const { file, models } = await fixture([
      {
        ...validHtmlSource,
        url: "not a URL",
        html_selector: undefined,
        max_download_bytes: undefined,
        max_bytes: 50,
      },
    ]);
    const message = (await loadSourceRegistry(file, models)).issues[0]!.message;
    expect(message).toContain("url: Invalid url");
    expect(message).toContain("html_selector: is required for HTML");
    expect(message).toContain("max_download_bytes: is required for HTML");
    expect(message).toContain("max_bytes: must be greater than min_bytes");
  });

  it("rejects a missing catalog provider directory", async () => {
    const { file, models } = await fixture([{ ...validSource, catalog_provider: "missing" }]);
    expect((await loadSourceRegistry(file, models)).issues[0]!.message).toContain(
      "maps to missing models/missing/",
    );
  });

  it("reports missing and orphaned snapshots", async () => {
    const { file, models, snapshots } = await fixture();
    const { registry } = await loadSourceRegistry(file, models);
    await fs.mkdir(path.join(snapshots, "other"), { recursive: true });
    await fs.writeFile(path.join(snapshots, "other", "orphan.md"), "orphan", "utf8");
    const issues = await validateSnapshotInventory(registry!, snapshots);
    expect(issues.map((issue) => issue.message).sort()).toEqual([
      "snapshot has no registry row",
      "snapshot is missing",
    ]);
  });
});
