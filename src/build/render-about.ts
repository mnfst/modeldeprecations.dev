// The About page.
//
// A site whose whole claim is "every date is sourced" needs somewhere that
// explains how the sourcing works, who stands behind it and how to report a
// wrong date. That is a trust signal for a reader deciding whether to plan a
// migration around this data, and the page search engines look for when they
// assess whether a data site knows what it is talking about.

import path from "node:path";
import ejs from "ejs";
import { uniqueProviders } from "../data/catalog.js";
import { VIEWS_DIR } from "../data/paths.js";
import { REPO_URL, SIBLING_URL, SITE_NAME, SITE_URL } from "../data/site.js";
import { ABOUT_PATH, absolute, ogImagePath } from "../data/urls.js";
import type { Model } from "../schema/model.js";
import { fitDescription, fitTitle } from "./meta.js";
import { buildAboutStructuredData } from "./structured-data.js";
import { hubLinks, renderShell, viewHelpers } from "./render.js";

export function aboutPageTitle(): string {
  return fitTitle([
    `How we source every date · ${SITE_NAME}`,
    "How we source every model deprecation date",
    "About modeldeprecations.dev",
  ]);
}

export function aboutPageDescription(modelCount: number): string {
  return fitDescription([
    `How this catalog is built: every deprecation and shutdown date across ${modelCount} models is cited to the provider's own docs, dated, and reviewed in public.`,
    `Every date across ${modelCount} models is cited to the provider's own docs and reviewed in public. How the catalog is built, and how to report a wrong date.`,
    "How this catalog is built, and how to report a wrong date.",
  ]);
}

export async function renderAboutPage(models: Model[], today: string): Promise<string> {
  const body = await ejs.renderFile(path.join(VIEWS_DIR, "about.ejs"), {
    modelCount: models.length,
    providerCount: uniqueProviders(models).length,
    repoUrl: REPO_URL,
    siblingUrl: SIBLING_URL,
    helpers: viewHelpers,
  });

  const description = aboutPageDescription(models.length);
  return renderShell(
    {
      title: aboutPageTitle(),
      description,
      canonicalUrl: absolute(SITE_URL, ABOUT_PATH),
      ogImage: ogImagePath(ABOUT_PATH),
      structuredData: buildAboutStructuredData(description, SITE_URL, today),
      providerHubs: hubLinks(models, today),
    },
    body,
  );
}
