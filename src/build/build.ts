import fs from "node:fs/promises";
import path from "node:path";
import { buildBadge } from "../data/badge.js";
import { buildIcs } from "../data/calendar.js";
import { buildCatalog, uniqueProviders } from "../data/catalog.js";
import { buildChangelog } from "../data/changelog.js";
import { buildRss } from "../data/feed.js";
import { shutdownYears, STATUS_HUBS } from "../data/hubs.js";
import { buildLlmsFullTxt, buildLlmsTxt } from "../data/llms.js";
import { loadAllModels } from "../data/load.js";
import { modelMarkdown } from "../data/markdown.js";
import { DIST_API_DIR, DIST_ASSETS_DIR, DIST_DIR, MODELS_DIR, REPO_ROOT } from "../data/paths.js";
import { buildRobotsTxt } from "../data/robots.js";
import { buildSitemap } from "../data/sitemap.js";
import { buildDate, SITE_URL } from "../data/site.js";
import { RESERVED_ROOT_SEGMENTS } from "../data/urls.js";
import { buildModelJsonSchema } from "../schema/generate.js";
import { statusOn, type Model } from "../schema/model.js";
import { bundleClientScript, compileStyles, copyStaticAssets } from "./assets.js";
import { gitLastmodMap } from "./lastmod.js";
import { writeOgImages } from "./og.js";
import { renderAboutPage } from "./render-about.js";
import { renderAliasPage } from "./render-alias.js";
import { renderApiPage } from "./render-api.js";
import { renderStatusHubPage, renderYearHubPage } from "./render-hub.js";
import { renderCalendarPage } from "./render-calendar.js";
import { renderChangelogPage } from "./render-changelog.js";
import { renderIndex } from "./render.js";
import { renderModelPage } from "./render-model.js";
import { renderNotFoundPage } from "./render-not-found.js";
import { renderProviderPage } from "./render-provider.js";

async function cleanDist(): Promise<void> {
  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await fs.mkdir(DIST_ASSETS_DIR, { recursive: true });
  await fs.mkdir(path.join(DIST_API_DIR, "models"), { recursive: true });
}

async function writeFile(file: string, contents: string | Buffer): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, contents);
}

async function writeJson(file: string, payload: unknown): Promise<void> {
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`);
}

/** A provider slug that collides with a site-owned root path would shadow it. */
function assertNoRouteCollisions(providers: string[]): void {
  const clashes = providers.filter((provider) => RESERVED_ROOT_SEGMENTS.has(provider));
  if (clashes.length > 0) {
    throw new Error(
      `Provider slug(s) ${clashes.join(", ")} collide with a reserved root path. Rename the provider directory.`,
    );
  }
}

async function writeHtmlPages(models: Model[], today: string): Promise<void> {
  for (const model of models) {
    await writeFile(
      path.join(DIST_DIR, model.provider, `${model.model}.html`),
      await renderModelPage(model, models, today),
    );
    await writeFile(
      path.join(DIST_DIR, model.provider, `${model.model}.md`),
      modelMarkdown(model, models, SITE_URL, today),
    );
    for (const alias of model.aliases) {
      await writeFile(
        path.join(DIST_DIR, model.provider, `${alias}.html`),
        renderAliasPage(model, alias, SITE_URL),
      );
    }
  }

  for (const provider of uniqueProviders(models)) {
    const owned = models.filter((model) => model.provider === provider);
    await writeFile(
      path.join(DIST_DIR, `${provider}.html`),
      await renderProviderPage(provider, owned, models, today),
    );
  }
}

/** The cross-provider slices: /deprecated, /retired and one page per year. */
async function writeHubPages(models: Model[], today: string): Promise<number> {
  for (const status of STATUS_HUBS) {
    await writeFile(
      path.join(DIST_DIR, `${status}.html`),
      await renderStatusHubPage(status, models, today),
    );
  }
  const years = shutdownYears(models, today);
  for (const year of years) {
    await writeFile(
      path.join(DIST_DIR, "shutdowns", `${year}.html`),
      await renderYearHubPage(year, models, today),
    );
  }
  return STATUS_HUBS.length + years.length;
}

async function writeApiFiles(models: Model[], today: string): Promise<void> {
  await writeJson(path.join(DIST_API_DIR, "models.json"), buildCatalog(models, today));
  await writeJson(path.join(DIST_API_DIR, "schema.json"), buildModelJsonSchema());
  await writeJson(path.join(DIST_API_DIR, "index.json"), {
    name: "modeldeprecations.dev API",
    version: "v1",
    asOf: today,
    endpoints: {
      catalog: "/api/v1/models.json",
      schema: "/api/v1/schema.json",
      modelById: "/api/v1/models/{provider}/{model}.json",
      badge: "/badge/{provider}/{model}.json",
      markdown: "/{provider}/{model}.md",
      calendar: "/calendar.ics",
      changelog: "/changelog.xml",
    },
    modelCount: models.length,
    docs: "https://github.com/mnfst/modeldeprecations.dev#api",
  });

  for (const model of models) {
    await writeJson(path.join(DIST_API_DIR, "models", model.provider, `${model.model}.json`), {
      $schema: "https://modeldeprecations.dev/api/v1/schema.json",
      ...model,
      computed_status: statusOn(model, today),
      asOf: today,
    });
    await writeJson(
      path.join(DIST_DIR, "badge", model.provider, `${model.model}.json`),
      buildBadge(model, today),
    );
  }
}

async function writeSitemap(models: Model[], today: string): Promise<void> {
  await writeFile(path.join(DIST_DIR, "robots.txt"), buildRobotsTxt(SITE_URL));
  // lastmod comes from the commit dates of the YAML behind each URL, so a
  // rebuild that changed nothing does not claim the whole site is fresh.
  const dates = gitLastmodMap(REPO_ROOT);
  await writeFile(path.join(DIST_DIR, "sitemap.xml"), buildSitemap(models, dates, today, SITE_URL));
}

export async function build(): Promise<{ models: number; pages: number }> {
  const startedAt = Date.now();
  const today = buildDate();
  console.log(`Loading models from ${path.relative(process.cwd(), MODELS_DIR)} (as of ${today})...`);

  const { models, issues } = await loadAllModels();
  if (issues.length > 0) {
    console.error(`Aborting build — ${issues.length} validation issue(s):`);
    for (const issue of issues) console.error(`  ${issue.file}\n    ${issue.message}`);
    throw new Error("Validation failed");
  }

  const providers = uniqueProviders(models);
  assertNoRouteCollisions(providers);
  await cleanDist();

  console.log("Bundling client + styles...");
  await Promise.all([bundleClientScript(), compileStyles(), copyStaticAssets()]);

  const changelog = buildChangelog(models);

  console.log(`Rendering ${models.length} model pages and ${providers.length} provider hubs...`);
  await writeFile(path.join(DIST_DIR, "index.html"), await renderIndex({ models, today }));
  await writeHtmlPages(models, today);
  await writeFile(path.join(DIST_DIR, "calendar.html"), await renderCalendarPage(models, today));
  await writeFile(
    path.join(DIST_DIR, "changelog.html"),
    await renderChangelogPage(changelog, models, today),
  );
  await writeFile(path.join(DIST_DIR, "api.html"), await renderApiPage(models, today));
  await writeFile(path.join(DIST_DIR, "about.html"), await renderAboutPage(models, today));
  const hubs = await writeHubPages(models, today);
  await writeFile(path.join(DIST_DIR, "404.html"), await renderNotFoundPage(models, today));

  console.log("Writing JSON API, badges, feeds...");
  await writeApiFiles(models, today);
  await writeFile(path.join(DIST_DIR, "calendar.ics"), buildIcs(models, SITE_URL, today));
  await writeFile(path.join(DIST_DIR, "changelog.xml"), buildRss(changelog, SITE_URL));
  await writeFile(path.join(DIST_DIR, "llms.txt"), buildLlmsTxt(SITE_URL, models, today));
  await writeFile(path.join(DIST_DIR, "llms-full.txt"), buildLlmsFullTxt(SITE_URL, models, today));
  await writeSitemap(models, today);

  console.log("Generating social cards...");
  const cards = await writeOgImages(models, providers, changelog.length, today);
  console.log(`  ${cards} social cards written.`);

  const aliases = models.reduce((sum, model) => sum + model.aliases.length, 0);
  // index, calendar, changelog, api, about, 404 — plus the cross-provider hubs.
  const pages = models.length + providers.length + aliases + hubs + 6;
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(2);
  console.log(`Built ${models.length} models (${aliases} aliases) into ${pages} pages in ${elapsed}s.`);
  return { models: models.length, pages };
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  build().catch((err) => {
    console.error("Build failed:", err);
    process.exit(1);
  });
}
