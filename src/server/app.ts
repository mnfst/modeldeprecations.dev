import express from "express";
import { buildChangelog } from "../data/changelog.js";
import { shutdownYears, STATUS_HUBS } from "../data/hubs.js";
import { modelMarkdown } from "../data/markdown.js";
import { DIST_ASSETS_DIR } from "../data/paths.js";
import { buildDate, SITE_URL } from "../data/site.js";
import { RESERVED_ROOT_SEGMENTS } from "../data/urls.js";
import { modelId, type Model } from "../schema/model.js";
import { renderAboutPage } from "../build/render-about.js";
import { renderAliasPage } from "../build/render-alias.js";
import { renderApiPage } from "../build/render-api.js";
import { renderCalendarPage } from "../build/render-calendar.js";
import { renderChangelogPage } from "../build/render-changelog.js";
import { renderStatusHubPage, renderYearHubPage } from "../build/render-hub.js";
import { renderModelPage } from "../build/render-model.js";
import { renderNotFoundPage } from "../build/render-not-found.js";
import { renderProviderPage } from "../build/render-provider.js";
import { renderIndex } from "../build/render.js";
import { mountMachineRoutes } from "./routes-machine.js";

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

  // The API and the badges are for programmatic callers, not search results, and
  // the .md twins duplicate a model page verbatim. `noindex` keeps crawlers on the
  // HTML pages while every one of those surfaces stays fetchable. Production is
  // static, so vercel.json carries the same headers — this is dev/test parity.
  app.use(["/api", "/badge"], (_req, res, next) => {
    res.setHeader("X-Robots-Tag", "noindex, follow");
    next();
  });
  app.use((req, res, next) => {
    if (req.path.endsWith(".md")) res.setHeader("X-Robots-Tag", "noindex, follow");
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

  app.get("/about", async (_req, res, next) => {
    try {
      html(res, await renderAboutPage(await loadModels(), buildDate()));
    } catch (err) {
      next(err);
    }
  });

  // Declared before /:provider so a lifecycle hub is never mistaken for a
  // provider slug — the same reason those words are reserved root segments.
  for (const status of STATUS_HUBS) {
    app.get(`/${status}`, async (_req, res, next) => {
      try {
        html(res, await renderStatusHubPage(status, await loadModels(), buildDate()));
      } catch (err) {
        next(err);
      }
    });
  }

  app.get("/shutdowns/:year", async (req, res, next) => {
    try {
      const models = await loadModels();
      const today = buildDate();
      // Only years the catalog actually has shutdowns in get a page, so a guessed
      // /shutdowns/1999 404s here exactly as it would against the static build.
      if (!shutdownYears(models, today).includes(req.params.year)) {
        res
          .status(404)
          .type("html")
          .send(await renderNotFoundPage(models, today));
        return;
      }
      html(res, await renderYearHubPage(req.params.year, models, today));
    } catch (err) {
      next(err);
    }
  });

  mountMachineRoutes(app, loadModels);

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
