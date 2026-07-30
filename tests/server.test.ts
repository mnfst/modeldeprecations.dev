// Exercises the real routes over HTTP. The dev server and the static build share
// these renderers, so a page that 500s here would ship broken.

import { describe, expect, it } from "vitest";
import request from "supertest";
import { makeApp } from "../src/server/app.js";
import { loadAllModels } from "../src/data/load.js";

const { models } = await loadAllModels();
const app = makeApp(async () => models);
const sample = models.find((entry) => entry.aliases.length > 0)!;
const retired = models.find((entry) => entry.status === "retired")!;

describe("HTML routes", () => {
  it("serves the homepage with the full model table", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Which AI models are being shut down?");
    expect(res.text).toContain(`/${retired.provider}/${retired.model}`);
  });

  it("serves a model page with its answer and its JSON-LD", async () => {
    const res = await request(app).get(`/${retired.provider}/${retired.model}`);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/class="answer[^"]*">\s*(Yes|No) — /);
    expect(res.text).toContain('<script type="application/ld+json">');
    expect(res.text).toContain('rel="canonical"');
  });

  it("serves each provider hub", async () => {
    for (const provider of ["openai", "anthropic", "google"]) {
      const res = await request(app).get(`/${provider}`);
      expect(res.status).toBe(200);
      expect(res.text).toContain("deprecated models");
    }
  });

  it("serves the calendar and changelog", async () => {
    expect((await request(app).get("/calendar")).status).toBe(200);
    expect((await request(app).get("/changelog")).status).toBe(200);
    expect((await request(app).get("/api")).status).toBe(200);
  });

  // The alias is what people have in their code; it must land somewhere useful.
  it("redirects an alias to the canonical page", async () => {
    const res = await request(app).get(`/${sample.provider}/${sample.aliases[0]}`);
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe(`/${sample.provider}/${sample.model}`);
  });

  it("returns a real 404 page for an unknown model and an unknown provider", async () => {
    const missing = await request(app).get("/openai/not-a-model");
    expect(missing.status).toBe(404);
    expect(missing.text).toContain("No page for that model");
    expect((await request(app).get("/nobody")).status).toBe(404);
  });
});

describe("machine-readable routes", () => {
  it("serves the catalog with a build-date status on every entry", async () => {
    const res = await request(app).get("/api/v1/models.json");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(models.length);
    expect(res.body.models[0].computed_status).toMatch(/^(active|deprecated|retired)$/);
  });

  it("serves one model as JSON and 404s an unknown one", async () => {
    const res = await request(app).get(`/api/v1/models/${retired.provider}/${retired.model}.json`);
    expect(res.status).toBe(200);
    expect(res.body.model).toBe(retired.model);
    expect(res.body.sources.length).toBeGreaterThan(0);
    expect((await request(app).get("/api/v1/models/openai/nope.json")).status).toBe(404);
  });

  it("serves the page as Markdown", async () => {
    const res = await request(app).get(`/${retired.provider}/${retired.model}.md`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/markdown");
    expect(res.text).toContain("# ");
  });

  it("serves shields-compatible badge JSON", async () => {
    const res = await request(app).get(`/badge/${retired.provider}/${retired.model}.json`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ schemaVersion: 1, label: retired.model, message: "retired" });
  });

  it("serves the calendar and RSS feeds with the right content types", async () => {
    const ics = await request(app).get("/calendar.ics");
    expect(ics.status).toBe(200);
    expect(ics.headers["content-type"]).toContain("text/calendar");
    expect(ics.text).toContain("BEGIN:VCALENDAR");

    const rss = await request(app).get("/changelog.xml");
    expect(rss.status).toBe(200);
    expect(rss.headers["content-type"]).toContain("application/rss+xml");
  });

  it("serves robots.txt, llms.txt and llms-full.txt as plain text", async () => {
    for (const path of ["/robots.txt", "/llms.txt", "/llms-full.txt"]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/plain");
    }
  });

  it("serves the JSON Schema the YAML files reference", async () => {
    const res = await request(app).get("/api/v1/schema.json");
    expect(res.status).toBe(200);
    expect(res.body.$id).toBe("https://modeldeprecations.dev/api/v1/schema.json");
  });

  // Keeps crawlers on the HTML pages while leaving the JSON fetchable, so the
  // noindex header is actually readable rather than hidden behind a Disallow.
  it("marks the JSON API and badges noindex, but never the HTML", async () => {
    expect((await request(app).get("/api/v1/models.json")).headers["x-robots-tag"]).toBe("noindex");
    expect((await request(app).get("/badge/openai/gpt-4-32k.json")).headers["x-robots-tag"]).toBe(
      "noindex",
    );
    expect((await request(app).get("/")).headers["x-robots-tag"]).toBeUndefined();
    expect((await request(app).get("/openai")).headers["x-robots-tag"]).toBeUndefined();
  });

  // A provider directory named "calendar" would shadow the calendar page.
  it("keeps site-owned paths ahead of the provider route", async () => {
    expect((await request(app).get("/calendar")).text).toContain("shutdown calendar");
    expect((await request(app).get("/api")).text).toContain("Model deprecation API");
  });

  it("answers the health check", async () => {
    expect((await request(app).get("/healthz")).body).toEqual({ ok: true });
  });
});

describe("sitemap", () => {
  it("serves the same sitemap the static build writes", async () => {
    const res = await request(app).get("/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("xml");
    expect(res.text).toContain("<urlset");
  });

  // Only canonical, indexable HTML belongs here. The JSON is noindex, the .md
  // twins are alternates, and aliases canonicalize elsewhere — listing any of
  // them would ask Google to index a page we told it to ignore.
  it("lists every model page and nothing that is noindex", async () => {
    const { text } = await request(app).get("/sitemap.xml");
    const locs = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    expect(locs).toHaveLength(models.length + 3 + 4);
    for (const loc of locs) {
      expect(loc).not.toMatch(/\/api\/v1\/|\/badge\/|\.md$|\.json$/);
    }
    expect(locs).toContain(`https://modeldeprecations.dev/${retired.provider}/${retired.model}`);
    for (const alias of sample.aliases) {
      expect(locs).not.toContain(`https://modeldeprecations.dev/${sample.provider}/${alias}`);
    }
  });
});
