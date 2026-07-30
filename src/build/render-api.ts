import path from "node:path";
import ejs from "ejs";
import { VIEWS_DIR } from "../data/paths.js";
import { SITE_NAME, SITE_URL } from "../data/site.js";
import { absolute, API_PATH, ICS_PATH, ogImagePath, RSS_PATH } from "../data/urls.js";
import type { Model } from "../schema/model.js";
import { fitDescription, fitTitle } from "./meta.js";
import { hubLinks, renderShell, viewHelpers } from "./render.js";

export function apiPageTitle(): string {
  return fitTitle([
    `Model deprecation API — free JSON · ${SITE_NAME}`,
    "Model deprecation API — free JSON",
    "Model deprecation API",
  ]);
}

export function apiPageDescription(modelCount: number): string {
  return fitDescription([
    `A free, CORS-enabled JSON API for AI model deprecations: status, shutdown date and replacement for ${modelCount} models. No key required.`,
    `A free JSON API for AI model deprecations across ${modelCount} models. No key required.`,
  ]);
}

export async function renderApiPage(models: Model[], today: string): Promise<string> {
  const example = models.find((model) => model.status === "retired") ?? models[0];
  const body = await ejs.renderFile(path.join(VIEWS_DIR, "api.ejs"), {
    modelCount: models.length,
    siteUrl: SITE_URL,
    exampleId: example ? `${example.provider}/${example.model}` : "openai/gpt-4-32k",
    icsPath: ICS_PATH,
    rssPath: RSS_PATH,
    helpers: viewHelpers,
  });

  return renderShell(
    {
      title: apiPageTitle(),
      description: apiPageDescription(models.length),
      canonicalUrl: absolute(SITE_URL, API_PATH),
      ogImage: ogImagePath(API_PATH),
      structuredData: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "TechArticle",
        headline: apiPageTitle(),
        description: apiPageDescription(models.length),
        url: absolute(SITE_URL, API_PATH),
      }),
      providerHubs: hubLinks(models, today),
    },
    body,
  );
}
