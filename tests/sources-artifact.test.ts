import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateAndApplyArtifact } from "../src/sources/artifact.js";
import { sha256 } from "../src/sources/files.js";
import type { SourceEntry, SourceRegistry } from "../src/sources/registry.js";
import type { SourceReport } from "../src/sources/report.js";

const temporary: string[] = [];
const source: SourceEntry = {
  provider: "openai",
  slug: "deprecations",
  catalog_provider: "openai",
  format: "markdown",
  url: "https://example.com/deprecations.md",
  min_bytes: 5,
  max_bytes: 1000,
  required_markers: ["# Marker"],
};

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function fixture(status: "changed" | "unchanged" | "error" = "changed") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "source-artifact-"));
  temporary.push(root);
  const artifact = path.join(root, "artifact");
  const checkout = path.join(root, "checkout", "snapshots");
  const artifactSnapshot = path.join(artifact, "snapshots", "openai", "deprecations.md");
  const checkoutSnapshot = path.join(checkout, "openai", "deprecations.md");
  await fs.mkdir(path.dirname(artifactSnapshot), { recursive: true });
  await fs.mkdir(path.dirname(checkoutSnapshot), { recursive: true });
  const before = Buffer.from("# Marker\nOld\n");
  const after = Buffer.from(status === "error" ? before : "# Marker\nNew\n");
  await fs.writeFile(artifactSnapshot, after);
  await fs.writeFile(checkoutSnapshot, before);

  const base = { provider: "openai", slug: "deprecations", url: source.url, attempts: 1 };
  const report: SourceReport = {
    version: 1,
    started_at: "2026-08-20T04:00:00.000Z",
    results: [
      status === "error"
        ? { ...base, status, error_code: "http_status", error_message: "source returned HTTP 500" }
        : {
            ...base,
            status,
            before_bytes: before.byteLength,
            after_bytes: after.byteLength,
            before_sha256: sha256(before),
            after_sha256: sha256(after),
          },
    ],
  };
  await fs.mkdir(path.join(artifact, ".source-fetch"), { recursive: true });
  await fs.writeFile(path.join(artifact, ".source-fetch", "report.json"), JSON.stringify(report));
  return { artifact, checkout, artifactSnapshot, checkoutSnapshot, report };
}

const registry = { sources: [source] } as SourceRegistry;

describe("validateAndApplyArtifact", () => {
  it("validates hashes and applies changed snapshots", async () => {
    const setup = await fixture();
    const result = await validateAndApplyArtifact(registry, setup.artifact, setup.checkout);
    expect(result).toMatchObject({ changed: 1, errors: 0 });
    expect(await fs.readFile(setup.checkoutSnapshot, "utf8")).toBe("# Marker\nNew\n");
  });

  it("rejects a mismatched hash", async () => {
    const setup = await fixture();
    await fs.writeFile(setup.artifactSnapshot, "# Marker\nTampered\n");
    await expect(
      validateAndApplyArtifact(registry, setup.artifact, setup.checkout),
    ).rejects.toThrow("does not match");
  });

  it("rejects unexpected files", async () => {
    const setup = await fixture();
    await fs.writeFile(path.join(setup.artifact, "extra.txt"), "extra");
    await expect(
      validateAndApplyArtifact(registry, setup.artifact, setup.checkout),
    ).rejects.toThrow("unexpected file");
  });

  it("rejects changed content for an error result", async () => {
    const setup = await fixture("error");
    await fs.writeFile(setup.artifactSnapshot, "# Marker\nChanged despite error\n");
    await expect(
      validateAndApplyArtifact(registry, setup.artifact, setup.checkout),
    ).rejects.toThrow("changed despite an error");
  });

  it("rejects reports that omit a registry source", async () => {
    const setup = await fixture();
    const report = { ...setup.report, results: [] };
    await fs.writeFile(
      path.join(setup.artifact, ".source-fetch", "report.json"),
      JSON.stringify(report),
    );
    await expect(
      validateAndApplyArtifact(registry, setup.artifact, setup.checkout),
    ).rejects.toThrow("does not cover every registry source");
  });
});
