import path from "node:path";
import ejs from "ejs";
import { providerSections } from "../data/catalog.js";
import { providerLabel } from "../data/display.js";
import { VIEWS_DIR } from "../data/paths.js";
import { SITE_NAME, SITE_URL } from "../data/site.js";
import { formatDate } from "../data/status.js";
import { absolute, ogImagePath, providerPagePath } from "../data/urls.js";
import type { Model } from "../schema/model.js";
import { fitDescription, fitTitle } from "./meta.js";
import { buildProviderStructuredData } from "./structured-data.js";
import { hubLinks, renderShell, viewHelpers } from "./render.js";

/** Targets "openai deprecated models list" — the list intent, keyword first. */
export function providerPageTitle(provider: string): string {
  const who = providerLabel(provider);
  return fitTitle([
    `${who} deprecated models — shutdown dates · ${SITE_NAME}`,
    `${who} deprecated models — shutdown dates`,
    `${who} deprecated models`,
  ]);
}

export function providerPageDescription(
  provider: string,
  models: Model[],
  today: string,
): string {
  const who = providerLabel(provider);
  const sections = providerSections(models, today);
  const deprecated = sections.deprecated.length + sections.shuttingSoon.length;
  const counts = `${deprecated} deprecated or scheduled, ${sections.retired.length} retired, ${sections.active.length} active`;
  const next = sections.shuttingSoon[0];
  const soonest = next?.life.shutdown
    ? ` Next shutdown: ${next.model.name} on ${formatDate(next.life.shutdown)}.`
    : "";
  return fitDescription([
    `Every ${who} model deprecation and shutdown date: ${counts}.${soonest}`,
    `Every ${who} model deprecation and shutdown date: ${counts}.`,
    `Every ${who} model deprecation and shutdown date.`,
  ]);
}

export async function renderProviderPage(
  provider: string,
  providerModels: Model[],
  allModels: Model[],
  today: string,
): Promise<string> {
  const sections = providerSections(providerModels, today);
  const body = await ejs.renderFile(path.join(VIEWS_DIR, "provider.ejs"), {
    provider,
    providerName: providerLabel(provider),
    sections,
    total: providerModels.length,
    today,
    helpers: viewHelpers,
  });

  const description = providerPageDescription(provider, providerModels, today);
  return renderShell(
    {
      title: providerPageTitle(provider),
      // No second trim here: fitDescription already picked a candidate inside the
      // budget, and slicing again would cut mid-word and leave the meta tag
      // saying something different from the JSON-LD description below.
      description,
      canonicalUrl: absolute(SITE_URL, providerPagePath(provider)),
      ogImage: ogImagePath(providerPagePath(provider)),
      structuredData: buildProviderStructuredData(
        provider,
        providerModels,
        description,
        SITE_URL,
        today,
      ),
      providerHubs: hubLinks(allModels, today),
    },
    body,
  );
}
