// The machine-readable half of the dev server: the JSON API, the badge
// endpoints and the crawl/feed files. Split out of app.ts to keep that file
// under the 300-line rule, and because these routes share a shape the HTML
// routes do not — they serve a built artifact rather than a rendered page.
//
// Production serves all of this as static files from dist/. These exist so dev
// and the test suite exercise the same builders the static build calls.

import type express from "express";
import { gitLastmodMap } from "../build/lastmod.js";
import { buildBadge } from "../data/badge.js";
import { buildIcs } from "../data/calendar.js";
import { buildCatalog } from "../data/catalog.js";
import { buildChangelog } from "../data/changelog.js";
import { buildRss } from "../data/feed.js";
import { buildLlmsFullTxt, buildLlmsTxt } from "../data/llms.js";
import { REPO_ROOT } from "../data/paths.js";
import { buildRobotsTxt } from "../data/robots.js";
import { buildDate, SITE_URL } from "../data/site.js";
import { buildSitemap } from "../data/sitemap.js";
import { buildModelJsonSchema } from "../schema/generate.js";
import { modelId, statusOn } from "../schema/model.js";
import type { LoadModels } from "./app.js";

export function mountMachineRoutes(app: express.Express, loadModels: LoadModels): void {
  app.get("/api/v1/models.json", async (_req, res, next) => {
    try {
      res.json(buildCatalog(await loadModels(), buildDate()));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/schema.json", (_req, res) => {
    res.json(buildModelJsonSchema());
  });

  app.get("/api/v1/models/:provider/:slug.json", async (req, res, next) => {
    try {
      const today = buildDate();
      const models = await loadModels();
      const wanted = `${req.params.provider}/${req.params.slug}`;
      const model = models.find((entry) => modelId(entry) === wanted);
      if (!model) {
        res.status(404).json({ error: "not_found", id: wanted });
        return;
      }
      res.json({
        $schema: "https://modeldeprecations.dev/api/v1/schema.json",
        ...model,
        computed_status: statusOn(model, today),
        asOf: today,
      });
    } catch (err) {
      next(err);
    }
  });

  app.get("/badge/:provider/:slug.json", async (req, res, next) => {
    try {
      const models = await loadModels();
      const wanted = `${req.params.provider}/${req.params.slug}`;
      const model = models.find((entry) => modelId(entry) === wanted);
      if (!model) {
        res.status(404).json({
          schemaVersion: 1,
          label: req.params.slug,
          message: "unknown",
          color: "lightgrey",
        });
        return;
      }
      res.json(buildBadge(model, buildDate()));
    } catch (err) {
      next(err);
    }
  });

  app.get("/calendar.ics", async (_req, res, next) => {
    try {
      res
        .type("text/calendar; charset=utf-8")
        .send(buildIcs(await loadModels(), SITE_URL, buildDate()));
    } catch (err) {
      next(err);
    }
  });

  app.get("/changelog.xml", async (_req, res, next) => {
    try {
      res.type("application/rss+xml").send(buildRss(buildChangelog(await loadModels()), SITE_URL));
    } catch (err) {
      next(err);
    }
  });

  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain; charset=utf-8").send(buildRobotsTxt(SITE_URL));
  });

  app.get("/sitemap.xml", async (_req, res, next) => {
    try {
      const today = buildDate();
      const sitemap = buildSitemap(await loadModels(), gitLastmodMap(REPO_ROOT), today, SITE_URL);
      res.type("application/xml").send(sitemap);
    } catch (err) {
      next(err);
    }
  });

  app.get("/llms.txt", async (_req, res, next) => {
    try {
      res
        .type("text/plain; charset=utf-8")
        .send(buildLlmsTxt(SITE_URL, await loadModels(), buildDate()));
    } catch (err) {
      next(err);
    }
  });

  app.get("/llms-full.txt", async (_req, res, next) => {
    try {
      res
        .type("text/plain; charset=utf-8")
        .send(buildLlmsFullTxt(SITE_URL, await loadModels(), buildDate()));
    } catch (err) {
      next(err);
    }
  });
}
