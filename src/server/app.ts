import express from "express";
import { buildBadge } from "../data/badge.js";
import { buildIcs } from "../data/calendar.js";
import { buildCatalog } from "../data/catalog.js";
import { buildChangelog } from "../data/changelog.js";
import { buildRss } from "../data/feed.js";
import { buildLlmsFullTxt, buildLlmsTxt } from "../data/llms.js";
import { modelMarkdown } from "../data/markdown.js";
import { DIST_ASSETS_DIR, REPO_ROOT } from "../data/paths.js";
import { buildRobotsTxt } from "../data/robots.js";
import { buildSitemap } from "../data/sitemap.js";
import { gitLastmodMap } from "../build/lastmod.js";
import { buildDate, SITE_URL } from "../data/site.js";
import { RESERVED_ROOT_SEGMENTS } from "../data/urls.js";
import { buildModelJsonSchema } from "../schema/generate.js";
import { modelId, statusOn, type Model } from "../schema/model.js";
import { renderApiPage } from "../build/render-api.js";
import { renderCalendarPage } from "../build/render-calendar.js";
import { renderChangelogPage } from "../build/render-changelog.js";
import { renderIndex } from "../build/render.js";
import { renderModelPage } from "../build/render-model.js";
import { renderNotFoundPage } from "../build/render-not-found.js";
import { renderProviderPage } from "../build/render-provider.js";
import { renderAliasPage } from "../build/render-alias.js";

/**
 * Supplies the catalog to each request. The dev server passes a caching loader;
 * tests pass a fixed array. Keeping the source injectable lets the routes be
 * exercised over real HTTP without booting the watcher or the bundler.
 */
export type LoadModels = () => Promise<Model[]>;

function findByAlias(models: Model[], provider: string, id: string): Model | undefined {
  return models.find((model) => model.provider === provider && model.aliases.includes(id));
}

/** Build the HTTP app that serves the site, the JSON API and the feeds. */
export function makeApp(loadModels: LoadModels): express.Express {
  const app = express();
  app.disable("x-powered-by");

  app.use("/assets", express.static(DIST_ASSETS_DIR, { maxAge: 0 }));

  // The JSON API is for programmatic callers, not search results: `noindex` keeps
  // crawlers on the HTML pages while every endpoint stays fetchable. Production is
  // static, so vercel.json carries the same header — this is dev/test parity.
  app.use(["/api/v1", "/badge"], (_req, res, next) => {
    res.setHeader("X-Robots-Tag", "noindex");
    next();
  });
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  const html = (res: express.Response, body: string): void => {
    res.type("html").send(body);
  };

  app.get("/", async (_req, res, next) => {
    try {
      html(res, await renderIndex({ models: await loadModels(), today: buildDate() }));
    } catch (err) {
      next(err);
    }
  });

  app.get("/calendar", async (_req, res, next) => {
    try {
      html(res, await renderCalendarPage(await loadModels(), buildDate()));
    } catch (err) {
      next(err);
    }
  });

  app.get("/changelog", async (_req, res, next) => {
    try {
      const models = await loadModels();
      html(res, await renderChangelogPage(buildChangelog(models), models, buildDate()));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api", async (_req, res, next) => {
    try {
      html(res, await renderApiPage(await loadModels(), buildDate()));
    } catch (err) {
      next(err);
    }
  });

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
        res
          .status(404)
          .json({
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

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  // Model pages, their Markdown twins and their aliases. Registered after every
  // site-owned route so a provider slug can never shadow one.
  app.get("/:provider/:slug.md", async (req, res, next) => {
    try {
      const models = await loadModels();
      const wanted = `${req.params.provider}/${req.params.slug}`;
      const model = models.find((entry) => modelId(entry) === wanted);
      if (!model) {
        res.status(404).type("text/plain").send("Unknown model");
        return;
      }
      res
        .type("text/markdown; charset=utf-8")
        .send(modelMarkdown(model, models, SITE_URL, buildDate()));
    } catch (err) {
      next(err);
    }
  });

  app.get("/:provider/:slug", async (req, res, next) => {
    try {
      const { provider, slug } = req.params;
      const models = await loadModels();
      const model = models.find((entry) => modelId(entry) === `${provider}/${slug}`);
      if (model) {
        html(res, await renderModelPage(model, models, buildDate()));
        return;
      }
      const aliased = findByAlias(models, provider, slug);
      if (aliased) {
        res.redirect(301, `/${modelId(aliased)}`);
        return;
      }
      res
        .status(404)
        .type("html")
        .send(await renderNotFoundPage(models, buildDate()));
    } catch (err) {
      next(err);
    }
  });

  app.get("/:provider", async (req, res, next) => {
    try {
      const { provider } = req.params;
      const models = await loadModels();
      const owned = models.filter((model) => model.provider === provider);
      if (owned.length === 0 || RESERVED_ROOT_SEGMENTS.has(provider)) {
        res
          .status(404)
          .type("html")
          .send(await renderNotFoundPage(models, buildDate()));
        return;
      }
      html(res, await renderProviderPage(provider, owned, models, buildDate()));
    } catch (err) {
      next(err);
    }
  });

  app.use(async (_req, res, next) => {
    try {
      res
        .status(404)
        .type("html")
        .send(await renderNotFoundPage(await loadModels(), buildDate()));
    } catch (err) {
      next(err);
    }
  });

  return app;
}

export { renderAliasPage };
