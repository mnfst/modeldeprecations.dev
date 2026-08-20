import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SourceEntry, SourceRegistry } from "../src/sources/registry.js";
import { SourceReportSchema } from "../src/sources/report.js";
import { runSourceFetch } from "../src/sources/run.js";

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function entry(slug = "deprecations"): SourceEntry {
  return {
    provider: "openai",
    slug,
    catalog_provider: "openai",
    url: `https://example.com/${slug}.md`,
    min_bytes: 5,
    max_bytes: 1000,
    required_markers: ["# Marker"],
  };
}

async function fixture(sources: SourceEntry[] = [entry()]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "source-run-"));
  temporary.push(root);
  const snapshotsDir = path.join(root, "snapshots");
  const reportFile = path.join(root, ".source-fetch", "report.json");
  for (const source of sources) {
    const file = path.join(snapshotsDir, source.provider, `${source.slug}.md`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "# Marker\nOld body\n", "utf8");
  }
  return { registry: { sources } as SourceRegistry, snapshotsDir, reportFile };
}

function response(body: string): Response {
  return new Response(body, { headers: { "content-type": "text/markdown" } });
}

describe("runSourceFetch", () => {
  it("reports unchanged snapshots without rewriting them", async () => {
    const setup = await fixture();
    const report = await runSourceFetch(setup.registry, {
      ...setup,
      now: () => new Date("2026-08-20T04:00:00Z"),
      fetch: { fetch: vi.fn(async () => response("# Marker\nOld body\n")) },
    });
    expect(report.started_at).toBe("2026-08-20T04:00:00.000Z");
    expect(report.results[0]!.status).toBe("unchanged");
    expect(
      SourceReportSchema.parse(JSON.parse(await fs.readFile(setup.reportFile, "utf8"))),
    ).toEqual(report);
  });

  it("atomically replaces a changed snapshot", async () => {
    const setup = await fixture();
    const report = await runSourceFetch(setup.registry, {
      ...setup,
      fetch: { fetch: vi.fn(async () => response("# Marker\nNew body\n")) },
    });
    expect(report.results[0]!.status).toBe("changed");
    expect(
      await fs.readFile(path.join(setup.snapshotsDir, "openai", "deprecations.md"), "utf8"),
    ).toBe("# Marker\nNew body\n");
    expect(
      (await fs.readdir(path.join(setup.snapshotsDir, "openai"))).some((file) =>
        file.endsWith(".tmp"),
      ),
    ).toBe(false);
  });

  it("preserves baselines during partial source failure", async () => {
    const sources = [entry("one"), entry("two")];
    const setup = await fixture(sources);
    const fetch = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("one")
        ? response("# Marker\nNew body\n")
        : new Response("error", { status: 500 }),
    );
    const report = await runSourceFetch(setup.registry, {
      ...setup,
      fetch: { fetch, sleep: async () => undefined },
    });
    expect(report.results.map((result) => result.status)).toEqual(["changed", "error"]);
    expect(await fs.readFile(path.join(setup.snapshotsDir, "openai", "two.md"), "utf8")).toBe(
      "# Marker\nOld body\n",
    );
    expect(JSON.stringify(report)).not.toContain("error</html>");
  });

  it("limits concurrent fetches", async () => {
    const sources = Array.from({ length: 7 }, (_, index) => entry(`source-${index}`));
    const setup = await fixture(sources);
    let active = 0;
    let maximum = 0;
    const fetch = vi.fn(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return response("# Marker\nOld body\n");
    });
    await runSourceFetch(setup.registry, { ...setup, concurrency: 3, fetch: { fetch } });
    expect(maximum).toBe(3);
  });

  it("reports a missing snapshot without creating it", async () => {
    const setup = await fixture();
    await fs.rm(path.join(setup.snapshotsDir, "openai", "deprecations.md"));
    const report = await runSourceFetch(setup.registry, {
      ...setup,
      fetch: { fetch: vi.fn(async () => response("# Marker\nNew body\n")) },
    });
    expect(report.results[0]).toMatchObject({ status: "error", error_code: "missing_snapshot" });
  });
});
